import boto3
import os
import json
import re
from botocore.exceptions import ClientError
import argparse
from tqdm import tqdm
from typing import List, Dict, Any
import pandas as pd
import logging
import concurrent.futures

# Set up basic logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

from tasks.evaluation import (
    extract_task_outcome,
    aggregate_results_to_dataframe,
)

# --- Constants and Setup ---
# Calculate project root directory to allow for absolute path resolution
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Define a centralized output directory for all analysis results
analysis_output_dir = os.path.join(project_root, "experiments", "analysis_results")
# Ensure the output directory exists, creating it if necessary
os.makedirs(analysis_output_dir, exist_ok=True)

def download_s3_folders(bucket_name: str, s3_prefix: str, local_base_dir: str, max_workers: int = 10) -> List[str]:
    """
    Downloads experiment folders and their contents from S3 concurrently.

    This function uses a thread pool to parallelize the download of log files,
    which can significantly speed up the process for large-scale experiments.

    Args:
        bucket_name (str): The name of the S3 bucket.
        s3_prefix (str): The S3 prefix (folder path) where the experiments are stored.
        local_base_dir (str): The local directory to download the folders into.
        max_workers (int): The maximum number of concurrent download threads.

    Returns:
        List[str]: A list of local paths to the downloaded folders.
    """
    s3_client = boto3.client('s3')
    downloaded_folders = []
    
    if not os.path.isabs(local_base_dir):
        local_base_dir = os.path.join(project_root, local_base_dir)

    def download_file(s3_key, local_path):
        try:
            s3_client.download_file(bucket_name, s3_key, local_path)
            logging.debug(f"Successfully downloaded {s3_key} to {local_path}")
        except ClientError as e:
            logging.error(f"Failed to download {s3_key}: {e}")

    try:
        paginator = s3_client.get_paginator('list_objects_v2')
        pages = paginator.paginate(Bucket=bucket_name, Prefix=s3_prefix, Delimiter='/')

        s3_folder_prefixes = []
        for page in pages:
            if 'CommonPrefixes' in page:
                s3_folder_prefixes.extend([p['Prefix'] for p in page['CommonPrefixes']])
        
        if not s3_folder_prefixes:
            logging.warning(f"No folders found under s3://{bucket_name}/{s3_prefix}")
            return []

        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_key = {}
            for s3_folder_prefix in tqdm(s3_folder_prefixes, desc="Queueing downloads"):
                folder_name = s3_folder_prefix.rstrip('/').split('/')[-1]
                local_folder_path = os.path.join(local_base_dir, folder_name)
                os.makedirs(local_folder_path, exist_ok=True)
                downloaded_folders.append(local_folder_path)

                # List objects and submit download tasks
                obj_pages = paginator.paginate(Bucket=bucket_name, Prefix=s3_folder_prefix)
                for page in obj_pages:
                    if 'Contents' in page:
                        for obj in page['Contents']:
                            s3_key = obj['Key']
                            if not s3_key.endswith('/'): # Don't download "folders"
                                local_file_path = os.path.join(local_folder_path, os.path.basename(s3_key))
                                future = executor.submit(download_file, s3_key, local_file_path)
                                future_to_key[future] = s3_key
            
            for future in tqdm(concurrent.futures.as_completed(future_to_key), total=len(future_to_key), desc="Downloading files"):
                s3_key = future_to_key[future]
                try:
                    future.result()
                except Exception as exc:
                    logging.error(f'{s3_key} generated an exception: {exc}')

    except ClientError as e:
        logging.error(f"Error accessing S3: {e}")
        return []

    return downloaded_folders


def aggregate_results(local_folders: List[str], task_definitions: Dict[str, Any]) -> pd.DataFrame:
    """
    Aggregates experiment results from a list of local folders into a DataFrame.

    This function serves as the core analysis engine, iterating through each task
    folder, extracting outcomes, and compiling them into a single, comprehensive
    DataFrame for further analysis.

    Args:
        local_folders (List[str]): A list of paths to the task run folders.
        task_definitions (Dict[str, Any]): A dictionary of all task definitions,
                                           keyed by task_id.

    Returns:
        pd.DataFrame: A DataFrame containing the detailed evaluation results.
    """
    task_outcomes = []
    for folder_path in tqdm(local_folders, desc="Analyzing task folders"):
        task_id = os.path.basename(folder_path.strip(os.sep))
        task_def = task_definitions.get(task_id)

        if not task_def:
            logging.warning(f"No task definition found for task_id '{task_id}'. Skipping folder '{folder_path}'.")
            continue
        
        if 'task_id' not in task_def:
            task_def['task_id'] = task_id

        try:
            # Use the core evaluation function
            outcome = extract_task_outcome(folder_path, task_def)
            # The model name is often part of the folder structure, let's try to extract it
            # This is an example, and might need to be adapted based on the actual folder structure
            try:
                # e.g. experiments/my_exp_date/claude-3-5-sonnet-latest/task_1
                model_name = folder_path.split(os.sep)[-2]
                outcome.model_name = model_name
            except IndexError:
                outcome.model_name = "unknown"

            task_outcomes.append(outcome)
        except Exception as e:
            logging.error(f"Error processing folder {folder_path}: {e}")

    # Convert the list of dictionaries to a DataFrame
    return aggregate_results_to_dataframe(task_outcomes)


def get_immediate_subdirectories(a_dir: str) -> List[str]:
    """
    Gets a list of immediate subdirectories within a given directory.

    Args:
        a_dir (str): The directory to scan.

    Returns:
        List[str]: A list of full paths to the immediate subdirectories.
    """
    # Ensure a_dir is an absolute path for reliable processing
    if not os.path.isabs(a_dir):
        a_dir = os.path.join(project_root, a_dir)
    
    if not os.path.isdir(a_dir):
        logging.warning(f"Directory not found: {a_dir}")
        return []
        
    return [os.path.join(a_dir, name) for name in os.listdir(a_dir)
            if os.path.isdir(os.path.join(a_dir, name))]

def main() -> None:
    """
    Main function to run the analysis pipeline.

    Parses command-line arguments, downloads data from S3 if requested,
    analyzes the experiment logs, and saves the results to a CSV file.
    """
    parser = argparse.ArgumentParser(description="Analyze Mindcraft experiment results.")
    parser.add_argument('--s3_download', action="store_true", help='Download folders from S3 before analysis.')
    parser.add_argument('--aws_bucket_name', default="mindcraft-experiments", type=str, help='The name of the AWS S3 bucket.')
    parser.add_argument('--s3_folder_prefix', default="", type=str, help='The S3 prefix (folder) to download from.')
    parser.add_argument('--local_dir', default="experiments", type=str, help='Local directory with experiment results (relative to project root).')
    parser.add_argument('--task_file_path', required=True, type=str, help='Path to the task definition JSON file.')
    args = parser.parse_args()

    # --- Step 1: Determine Folders to Analyze ---
    local_dir_abs = args.local_dir
    if not os.path.isabs(local_dir_abs):
        local_dir_abs = os.path.join(project_root, local_dir_abs)

    if args.s3_download:
        if not args.s3_folder_prefix:
            logging.error("S3 folder prefix (--s3_folder_prefix) is required for S3 download.")
            return
        logging.info(f"Downloading folders from s3://{args.aws_bucket_name}/{args.s3_folder_prefix} to {local_dir_abs}...")
        folders_to_analyze = download_s3_folders(args.aws_bucket_name, args.s3_folder_prefix, local_dir_abs)
    else:
        logging.info(f"Analyzing local folders in: {local_dir_abs}")
        folders_to_analyze = get_immediate_subdirectories(local_dir_abs)

    if not folders_to_analyze:
        logging.warning("No folders found to analyze. Exiting.")
        return

    # --- Step 2: Load Task Definitions ---
    try:
        with open(args.task_file_path, 'r') as f:
            task_definitions = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        logging.error(f"Could not read or parse task file at '{args.task_file_path}': {e}")
        return

    # --- Step 3: Aggregate Results into a DataFrame ---
    results_df = aggregate_results(folders_to_analyze, task_definitions)

    if results_df.empty:
        logging.warning("Analysis generated no results. Exiting.")
        return

    # --- Step 4: Perform High-Level Analysis and Print Summary ---
    logging.info("\n--- Overall Results ---")
    if 'overall_is_successful' in results_df.columns:
        overall_success_rate = results_df['overall_is_successful'].mean()
        logging.info(f"Total Tasks Analyzed: {len(results_df)}")
        logging.info(f"Overall Success Rate: {overall_success_rate:.2%}")

    logging.info("\n--- Analysis by Task Type ---")
    if 'task_type' in results_df.columns:
        success_by_type = results_df.groupby('task_type')['overall_is_successful'].agg(['mean', 'count'])
        success_by_type.rename(columns={'mean': 'success_rate'}, inplace=True)
        logging.info("\n" + success_by_type.to_string())
    
    logging.info("\n--- Analysis by Model Name ---")
    if 'model_name' in results_df.columns:
        success_by_model = results_df.groupby('model_name')['overall_is_successful'].agg(['mean', 'count'])
        success_by_model.rename(columns={'mean': 'success_rate'}, inplace=True)
        logging.info("\n" + success_by_model.to_string())

    # --- Step 5: Save Results to CSV ---
    if args.s3_folder_prefix:
        output_filename_base = args.s3_folder_prefix.strip('/').replace('/', '_')
    else:
        output_filename_base = os.path.basename(os.path.normpath(local_dir_abs))
    
    results_csv_path = os.path.join(analysis_output_dir, f"{output_filename_base}_analysis_results.csv")
    results_df.to_csv(results_csv_path, index=False)
    logging.info(f"\nDetailed analysis results saved to: {results_csv_path}")

if __name__ == "__main__":
    main()