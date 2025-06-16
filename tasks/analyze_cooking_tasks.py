import os
import json
import re
import argparse
import pandas as pd
from prettytable import PrettyTable
from tqdm import tqdm
import logging
from typing import List, Dict, Any

# Import from our new centralized evaluation module
from tasks.evaluation import extract_task_outcome, aggregate_results_to_dataframe

# Set up basic logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Constants and Setup ---
# Calculate project root directory for reliable path resolution
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Define a centralized output directory for analysis results
analysis_output_dir = os.path.join(project_root, "experiments", "analysis_results")
# Ensure the output directory exists
os.makedirs(analysis_output_dir, exist_ok=True)

def get_immediate_subdirectories(a_dir: str) -> List[str]:
    """
    Returns a list of full paths to immediate subdirectories.
    
    Args:
        a_dir (str): The directory to scan.
        
    Returns:
        List[str]: A list of absolute paths to the subdirectories.
    """
    if not os.path.isabs(a_dir):
        a_dir = os.path.join(project_root, a_dir)
    if not os.path.isdir(a_dir):
        return []
    return [f.path for f in os.scandir(a_dir) if f.is_dir()]

def enrich_dataframe_with_cooking_metrics(df: pd.DataFrame) -> pd.DataFrame:
    """
    Enriches the DataFrame with cooking-specific metrics by parsing the 'task_id'.
    
    Warning: This function relies on a specific naming convention for task_id.
    A more robust long-term solution is to store these metrics directly in the
    task definition's metadata.

    Args:
        df (pd.DataFrame): The DataFrame to enrich.

    Returns:
        pd.DataFrame: The enriched DataFrame with new 'num_blocked_agents' and
                      'target_items' columns.
    """
    if df.empty:
        return df

    logging.warning("The 'enrich_dataframe_with_cooking_metrics' function relies on parsing task_id. "
                    "This is fragile and should be replaced by storing metrics directly in the task definition.")

    def get_blocked_agents_from_task_id(task_id: str) -> int:
        """Extracts the number of blocked agents from the task_id string."""
        if not isinstance(task_id, str):
            return 0
        match = re.search(r'blocked_access_([0-9_]+)$', task_id)
        if match:
            return len(match.group(1).split('_'))
        return 0
    
    df['num_blocked_agents'] = df['task_id'].apply(get_blocked_agents_from_task_id)

    def get_target_items_from_task_id(task_id: str) -> List[str]:
        """Extracts the list of target cooking items from the task_id string."""
        if not isinstance(task_id, str):
            return []
        clean_name = re.sub(r'^multiagent_cooking_', '', task_id)
        clean_name = re.sub(r'_blocked_access_[0-9_]+$', '', clean_name)
        items = [
            match.group(2).rstrip('_')
            for match in re.finditer(r'([0-9]+)_([a-zA-Z_]+)', clean_name)
        ]
        return items

    df['target_items'] = df['task_id'].apply(get_target_items_from_task_id)
    return df

def print_blocked_agents_summary(df: pd.DataFrame) -> None:
    """
    Prints a summary table of success rates by the number of blocked agents.

    Args:
        df (pd.DataFrame): The DataFrame containing the analysis results.
    """
    logging.info("\n--- Analysis by Number of Blocked Agents ---")
    if df.empty or 'num_blocked_agents' not in df.columns or df['num_blocked_agents'].sum() == 0:
        logging.warning("No data on blocked agents available for analysis.")
        return

    summary = df.groupby(['model_name', 'num_blocked_agents'])['overall_is_successful'].agg(['sum', 'count'])
    summary['success_rate'] = (summary['sum'] / summary['count']) * 100
    
    try:
        pivot = summary.reset_index().pivot(
            index='num_blocked_agents', 
            columns='model_name', 
            values=['success_rate', 'sum', 'count']
        )
    except KeyError:
        logging.error("Could not create pivot table for blocked agents. Check DataFrame content.")
        return
    
    table = PrettyTable()
    model_names = sorted(df['model_name'].unique())
    table.field_names = ["Blocked Agents"] + [f"{model} (Rate | Success/Total)" for model in model_names]
    
    for num_blocked in sorted(df['num_blocked_agents'].unique()):
        row = [f"{num_blocked} agent(s)"]
        for model in model_names:
            try:
                rate = pivot.loc[num_blocked, ('success_rate', model)]
                successes = pivot.loc[num_blocked, ('sum', model)]
                total = pivot.loc[num_blocked, ('count', model)]
                row.append(f"{rate:.2f}% | {int(successes)}/{int(total)}")
            except KeyError:
                row.append("N/A")
        table.add_row(row)
        
    logging.info("\n" + table.get_string())

def print_cooking_item_summary(df: pd.DataFrame) -> None:
    """
    Prints a summary table of success rates by target cooking item.

    Args:
        df (pd.DataFrame): The DataFrame containing the analysis results.
    """
    logging.info("\n--- Analysis by Cooking Item ---")
    if df.empty or 'target_items' not in df.columns:
        logging.warning("No data on cooking items available for analysis.")
        return

    df_items = df.explode('target_items')
    if df_items.empty:
        logging.warning("No cooking items found to analyze.")
        return
    
    summary = df_items.groupby(['model_name', 'target_items'])['overall_is_successful'].agg(['sum', 'count'])
    summary['success_rate'] = (summary['sum'] / summary['count']) * 100

    try:
        pivot = summary.reset_index().pivot(
            index='target_items',
            columns='model_name',
            values=['success_rate', 'sum', 'count']
        )
    except KeyError:
        logging.error("Could not create pivot table for cooking items. Check DataFrame content.")
        return

    table = PrettyTable()
    model_names = sorted(df['model_name'].unique())
    table.field_names = ["Cooking Item"] + [f"{model} (Rate | Success/Total)" for model in model_names]

    for item in sorted(df_items['target_items'].unique()):
        row = [item]
        for model in model_names:
            try:
                rate = pivot.loc[item, ('success_rate', model)]
                successes = pivot.loc[item, ('sum', model)]
                total = pivot.loc[item, ('count', model)]
                row.append(f"{rate:.2f}% | {int(successes)}/{int(total)}")
            except KeyError:
                row.append("N/A")
        table.add_row(row)
    
    logging.info("\n" + table.get_string())

def main() -> None:
    """
    Main function to run the cooking task analysis pipeline.
    
    Parses arguments, finds relevant cooking experiment folders, runs the
    evaluation, enriches the data with cooking-specific metrics, and prints
    summary tables.
    """
    parser = argparse.ArgumentParser(description='Analyze cooking task experiment results.')
    parser.add_argument('--log_dir', type=str, default='experiments',
                        help='Directory containing experiment folders (relative to project root).')
    parser.add_argument('--task_file_path', required=True, type=str,
                        help='Path to the task definition JSON file for cooking tasks.')
    args = parser.parse_args()

    # --- Step 1: Find Cooking-Specific Experiment Folders ---
    log_dir_abs = args.log_dir
    if not os.path.isabs(log_dir_abs):
        log_dir_abs = os.path.join(project_root, log_dir_abs)
    
    all_exp_folders = get_immediate_subdirectories(log_dir_abs)
    # Filter for folders that are explicitly for cooking tasks
    cooking_folders = [f for f in all_exp_folders if 'cooking' in os.path.basename(f).lower()]
    
    if not cooking_folders:
        logging.warning(f"No cooking experiment folders found in '{log_dir_abs}'. Exiting.")
        return

    logging.info(f"Found {len(cooking_folders)} cooking experiment folders to analyze.")

    # --- Step 2: Load Task Definitions ---
    try:
        with open(args.task_file_path, 'r') as f:
            task_definitions = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        logging.error(f"Error reading or parsing task file '{args.task_file_path}': {e}")
        return

    # --- Step 3: Run Core Evaluation and Aggregation ---
    task_outcomes = []
    for folder in tqdm(cooking_folders, desc="Analyzing cooking tasks"):
        task_id = os.path.basename(folder.strip(os.sep))
        task_def = task_definitions.get(task_id)
        if not task_def:
            logging.warning(f"No task definition found for '{task_id}'. Skipping.")
            continue
        
        if 'task_id' not in task_def:
            task_def['task_id'] = task_id
            
        outcome = extract_task_outcome(folder, task_def)
        
        try:
            model_name = os.path.basename(os.path.dirname(folder))
            outcome.model_name = model_name
        except IndexError:
            pass

        task_outcomes.append(outcome)

    df = aggregate_results_to_dataframe(task_outcomes)
    
    if df.empty:
        logging.warning("Analysis did not produce any results.")
        return

    # --- Step 4: Enrich with Cooking Metrics and Analyze ---
    df_enriched = enrich_dataframe_with_cooking_metrics(df)
    
    print_blocked_agents_summary(df_enriched)
    print_cooking_item_summary(df_enriched)

    # --- Step 5: Save Results ---
    output_filename = f"{os.path.basename(os.path.normpath(log_dir_abs))}_cooking_analysis.csv"
    output_path = os.path.join(analysis_output_dir, output_filename)
    df_enriched.to_csv(output_path, index=False)
    logging.info(f"\nDetailed cooking task analysis saved to: {output_path}")

if __name__ == "__main__":
    main()