import boto3
import os
import json
import re
from botocore.exceptions import ClientError
import json
import argparse
from tqdm import tqdm
import glob

# Calculate project root directory
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Define output directory for analysis results
analysis_output_dir = os.path.join(project_root, "experiments", "analysis_results")
# Ensure the output directory exists
os.makedirs(analysis_output_dir, exist_ok=True)

def download_s3_folders(bucket_name, s3_prefix, local_base_dir):
    """
    Downloads groups of folders from S3 based on the next level of prefixes.

    Args:
        bucket_name (str): Name of the S3 bucket.
        s3_prefix (str): Prefix where the folders are located (e.g., 'my-experiments/').
        local_base_dir (str): Local directory to download the folders to.

    Returns:
        list: List of downloaded local folder paths.
    """
    s3_client = boto3.client('s3')
    downloaded_folders = []

    # Ensure local_base_dir is relative to project root if not absolute
    if not os.path.isabs(local_base_dir):
        local_base_dir = os.path.join(project_root, local_base_dir)

    try:
        # List objects with the prefix, delimited by '/' to find sub-prefixes (folders)
        response = s3_client.list_objects_v2(Bucket=bucket_name, Prefix=s3_prefix, Delimiter='/')

        if 'CommonPrefixes' not in response:
            print(f"No folders found under s3://{bucket_name}/{s3_prefix}")
            return downloaded_folders

        s3_folder_prefixes = [prefix['Prefix'] for prefix in response['CommonPrefixes']]
        subfolder = s3_prefix.split('/')[-2]

        for s3_folder_prefix in tqdm(s3_folder_prefixes):
            folder_name = s3_folder_prefix.split('/')[-2] # Extract folder name
            local_folder_path = os.path.join(local_base_dir, subfolder, folder_name)
            os.makedirs(local_folder_path, exist_ok=True)
            downloaded_folders.append(local_folder_path)

            # Download files within the folder
            objects_in_folder = s3_client.list_objects_v2(Bucket=bucket_name, Prefix=s3_folder_prefix)
            if 'Contents' in objects_in_folder:
                for obj in objects_in_folder['Contents']:
                    s3_key = obj['Key']
                    local_file_path = os.path.join(local_folder_path, os.path.basename(s3_key))
                    try:
                        s3_client.download_file(bucket_name, s3_key, local_file_path)
                    except Exception as e:
                        print(f"Error downloading {s3_key}: {e}")
            
            else:
                print(f"No files found in {s3_folder_prefix}")

    except ClientError as e:
        print(f"Error accessing S3: {e}")
        return []

    return downloaded_folders

def analyze_json_file(file_path):
    """
    Analyzes a single JSON file to extract the task outcome.

    Args:
        file_path (str): Path to the JSON file.

    Returns:
        str or None: The task outcome string if found, otherwise None.
    """
    try:
        with open(file_path, 'r') as f:
            data = json.load(f)
            if 'turns' in data and isinstance(data['turns'], list):
                for turn in reversed(data['turns']):  # Check turns from the end
                    if turn.get('role') == 'system' and isinstance(turn.get('content'), str):
                        if "Task successful ended with code : 2" in turn['content'] or "Task ended with score : 1" in turn["content"] or "Task ended in score: 1" in turn["content"]:
                            return True
        return False
    except FileNotFoundError:
        print(f"Error: File not found: {file_path}")
        return None
    except json.JSONDecodeError:
        print(f"Error: Invalid JSON format in: {file_path}")
        return None
    except Exception as e:
        print(f"An unexpected error occurred while processing {file_path}: {e}")
        return None

def extract_result(folder_path):
    folder_name = os.path.basename(folder_path)
    json_files = glob.glob(os.path.join(folder_path, "*.json"))
    assert len(json_files) == 2, f"Expected 2 json files in {folder_name}, found {len(json_files)}"

    if not json_files:
        print(f"No JSON files found in {folder_name}")
        return None
    else: 
        outcome = False
        for json_file in json_files:
            outcome = analyze_json_file(json_file)
            if outcome:
                return True
        return False
    
def is_base(folder_path):
    return "full_plan" in folder_path and "depth_0" in folder_path and "missing" not in folder_path

def base_without_plan(folder_path):
    return "no_plan" in folder_path and "depth_0" in folder_path and "missing" in folder_path

def aggregate_results(local_folders):
    """
    Aggregates the analysis results for each folder.

    Args:
        local_folders (list): List of local folder paths containing the JSON files.

    Returns:
        dict: A dictionary where keys are folder names and values are the aggregated outcomes.
    """
    aggregated_data = {}

    total = 0
    successful = 0

    base_successful = 0
    base_total = 0

    base_no_plan_successful = 0
    base_no_plan_total = 0

    missing_successful = 0
    missing_total = 0

    full_plan_successful = 0
    full_plan_total = 0

    partial_plan_successful = 0
    partial_plan_total = 0

    no_plan_successful = 0
    no_plan_total = 0

    high_depth_successful = 0
    high_depth_total = 0
    for folder_path in tqdm(local_folders):
        folder_name = os.path.basename(folder_path)

        try: 
            total += 1
            result = extract_result(folder_path)
            success = int(extract_result(folder_path))
            successful += success

            if "missing" in folder_path and not is_base(folder_path):
                missing_successful += success
                missing_total += 1
            if is_base(folder_path):
                base_successful += success
                base_total += 1
            if base_without_plan(folder_path):
                base_no_plan_successful += success
                base_no_plan_total += 1
            if "full_plan" in folder_path and not is_base(folder_path):
                full_plan_successful += success
                full_plan_total += 1
            if "partial_plan" in folder_path and not is_base(folder_path):
                partial_plan_successful += success
                partial_plan_total += 1
            if "no_plan" in folder_path and not is_base(folder_path):
                no_plan_successful += success
                no_plan_total += 1
            if "depth_1" in folder_path or "depth_2" in folder_path and not is_base(folder_path):
                high_depth_successful += success
                high_depth_total += 1
        except Exception as e:
            print(f"Error processing {folder_name}: {e}")
    
    return {
        "total": total,
        "successful": successful,
        "success_rate": successful / total if total > 0 else 0,
        "base_total": base_total,
        "base_successful": base_successful,
        "base_success_rate": base_successful / base_total if base_total > 0 else 0,
        "base_no_plan_total": base_no_plan_total,
        "base_no_plan_successful": base_no_plan_successful,
        "base_no_plan_success_rate": base_no_plan_successful / base_no_plan_total if base_no_plan_total > 0 else 0,
        "missing_total": missing_total,
        "missing_successful": missing_successful,
        "missing_success_rate": missing_successful / missing_total if missing_total > 0 else 0,
        "full_plan_total": full_plan_total,
        "full_plan_successful": full_plan_successful,
        "full_plan_success_rate": full_plan_successful / full_plan_total if full_plan_total > 0 else 0,
        "partial_plan_total": partial_plan_total,
        "partial_plan_successful": partial_plan_successful,
        "partial_plan_success_rate": partial_plan_successful / partial_plan_total if partial_plan_total > 0 else 0,
        "no_plan_total": no_plan_total,
        "no_plan_successful": no_plan_successful,
        "no_plan_success_rate": no_plan_successful / no_plan_total if no_plan_total > 0 else 0,
        "high_depth_total": high_depth_total,
        "high_depth_successful": high_depth_successful,
        "high_depth_success_rate": high_depth_successful / high_depth_total if high_depth_total > 0 else 0
    }

def get_immediate_subdirectories(a_dir):
    # Ensure a_dir is relative to project root if not absolute
    if not os.path.isabs(a_dir):
        a_dir = os.path.join(project_root, a_dir)
    return [os.path.join(a_dir, name) for name in os.listdir(a_dir)
            if os.path.isdir(os.path.join(a_dir, name))]


# --- Main Execution ---
if __name__ == "__main__":
    # 1. Download folders from AWS or use local directory
    parser = argparse.ArgumentParser()
    parser.add_argument('--s3_download', action="store_true", help='Download folders from S3')
    parser.add_argument('--aws_bucket_name', default="mindcraft" , type=str, help='AWS bucket name')
    parser.add_argument('--s3_folder_prefix', default="", type=str, help='S3 folder prefix')
    # Change default input dir to 'experiments' relative to project root
    parser.add_argument('--local_download_dir', default="experiments", type=str, help='Local directory containing results (relative to project root)')
    args = parser.parse_args()

    AWS_BUCKET_NAME = args.aws_bucket_name
    S3_FOLDER_PREFIX = args.s3_folder_prefix
    
    # Resolve local_download_dir relative to project root
    local_download_dir_abs = args.local_download_dir
    if not os.path.isabs(local_download_dir_abs):
        local_download_dir_abs = os.path.join(project_root, local_download_dir_abs)
        
    # Construct LOCAL_DOWNLOAD_DIR based on the absolute path
    if args.local_download_dir != "": # Original check seems redundant now, but kept logic
        LOCAL_DOWNLOAD_DIR = local_download_dir_abs # Already includes prefix if s3_download
        if args.s3_download and S3_FOLDER_PREFIX: # Append S3 prefix if downloading
             LOCAL_DOWNLOAD_DIR = os.path.join(local_download_dir_abs, S3_FOLDER_PREFIX.replace('/', '_').rstrip('_'))
    else:
        LOCAL_DOWNLOAD_DIR = local_download_dir_abs # Should not happen with default
    
    if (args.s3_download):
        print(f"Downloading folders from s3://{AWS_BUCKET_NAME}/{S3_FOLDER_PREFIX} to {LOCAL_DOWNLOAD_DIR}...")
        # Pass the absolute base path for downloads
        folders = download_s3_folders(AWS_BUCKET_NAME, S3_FOLDER_PREFIX, local_download_dir_abs)
    else: 
        folders = get_immediate_subdirectories(local_download_dir_abs)
        print(folders)
        
    if not folders:
        print("No folders found or downloaded. Exiting.")
        exit()
        
    results = aggregate_results(folders)
    print(results)
    # Hardcode output path within experiments/analysis_results/
    results_file_path = os.path.join(analysis_output_dir, "analyse_results_output.txt")
    with open(results_file_path, "w") as file:
        file.write("Results\n")
        for key, value in results.items():
            file.write(f"{key}: {value}\n")
    print(f"Results saved to {results_file_path}")
    # if not downloaded_local_folders:
    #     print("No folders downloaded. Exiting.")
    #     exit()

    # print("\n--- Analyzing downloaded files ---")
    # # 2. & 3. Analyze files and aggregate results
    # results = aggregate_results(downloaded_local_folders)

    # print("\n--- Aggregated Results ---")
    # for folder, outcome in results.items():
    #     print(f"Folder: {folder} -> {outcome}")

    # Optional: Clean up downloaded files
    # import shutil
    # shutil.rmtree(LOCAL_DOWNLOAD_DIR)
    # print(f"\nCleaned up {LOCAL_DOWNLOAD_DIR}")