import os
import json
import re
from collections import defaultdict
from prettytable import PrettyTable
import pandas as pd
import glob
import argparse

# Calculate project root directory
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Define output directory for analysis results
analysis_output_dir = os.path.join(project_root, "experiments", "analysis_results")
# Ensure the output directory exists
os.makedirs(analysis_output_dir, exist_ok=True)

def extract_cooking_items(exp_dir):
    """Extract cooking items from experiment directory name."""
    # Remove prefix and blocked access part
    clean_name = re.sub(r'^multiagent_cooking_', '', exp_dir)
    clean_name = re.sub(r'_blocked_access_[0-9_]+$', '', clean_name)
    
    # Extract individual items
    items = []
    for item_match in re.finditer(r'([0-9]+)_([a-zA-Z_]+)', clean_name):
        count = int(item_match.group(1))
        item = item_match.group(2)
        # Remove trailing underscores to fix the item name issue
        item = item.rstrip('_')
        items.append(item)
    
    return items

def analyze_experiments(root_dir, model_name):
    # Store results by number of blocked agents
    blocked_access_results = defaultdict(lambda: {
        "success": 0, 
        "total": 0
    })
    
    # Store results by cooking item
    cooking_item_results = defaultdict(lambda: {
        "success": 0,
        "total": 0
    })
    
    # Keep track of all unique cooking items
    all_cooking_items = set()
    
    # Keep track of ignored tasks
    ignored_tasks = []
    
    # Get a list of all experiment directories
    experiment_dirs = [d for d in os.listdir(root_dir) if os.path.isdir(os.path.join(root_dir, d)) 
                      and d.startswith("multiagent_cooking_")]
    
    for exp_dir in experiment_dirs:
        # Extract cooking items
        cooking_items = extract_cooking_items(exp_dir)
        
        # Add to unique items set
        all_cooking_items.update(cooking_items)
        
        # Extract blocked access information from directory name
        blocked_access_match = re.search(r'blocked_access_([0-9_]+)$', exp_dir)
        
        if blocked_access_match:
            blocked_access_str = blocked_access_match.group(1)
            # Count how many agents have blocked access
            num_blocked_agents = len(blocked_access_str.split('_'))
            blocked_key = f"{num_blocked_agents} agent(s)"
        else:
            # No agents blocked
            blocked_key = "0 agent(s)"
        
        # Check if the task was successful
        is_successful = False
        score_found = False
        full_exp_path = os.path.join(root_dir, exp_dir)
        
        # Get all JSON files in the experiment directory
        agent_files = [f for f in os.listdir(full_exp_path) if f.endswith(".json")]
        
        # Check each agent file for success information
        for agent_file in agent_files:
            agent_file_path = os.path.join(full_exp_path, agent_file)
            
            try:
                with open(agent_file_path, 'r') as f:
                    agent_data = json.load(f)
                    
                # Check for score information in the turns data
                if "turns" in agent_data:
                    for turn in agent_data["turns"]:
                        if turn.get("role") == "system" and "content" in turn:
                            if isinstance(turn["content"], str) and "Task ended with score : " in turn["content"]:
                                score_found = True
                                if "Task ended with score : 1" in turn["content"]:
                                    is_successful = True
                                    break
                
                # If we found success, no need to check other files
                if is_successful:
                    break
                    
            except (json.JSONDecodeError, IOError) as e:
                print(f"Error reading {agent_file_path}: {e}")
                # Continue to check other agent files instead of failing
                continue
        
        # If no score information was found in any agent file, ignore this task
        if not score_found:
            ignored_tasks.append(exp_dir)
            continue
        
        # Update cooking item results
        for item in cooking_items:
            cooking_item_results[item]["total"] += 1
            if is_successful:
                cooking_item_results[item]["success"] += 1
        
        # Update the blocked access counters
        blocked_access_results[blocked_key]["total"] += 1
        if is_successful:
            blocked_access_results[blocked_key]["success"] += 1
    
    # Print information about ignored tasks
    if ignored_tasks:
        print(f"\n{model_name}: Ignored {len(ignored_tasks)} tasks with no score information:")
        for task in ignored_tasks:
            print(f"  - {task}")
    
    return blocked_access_results, cooking_item_results, all_cooking_items, ignored_tasks

def print_model_comparison_blocked(models_results):
    print("\nModel Comparison by Number of Agents with Blocked Access:")
    print("=" * 100)

    # Get all possible blocked access keys
    all_blocked_keys = set()
    for model_results in models_results.values():
        all_blocked_keys.update(model_results.keys())

    # Sort the keys
    sorted_keys = sorted(all_blocked_keys, key=lambda x: int(x.split()[0]))

    # Create the table
    table = PrettyTable()
    table.field_names = ["Blocked Agents"] + [
        f"{model_name} (Success Rate | Success/Total)" for model_name in models_results.keys()
    ]

    # Calculate and add rows for each blocked key
    model_totals = {model: {"success": 0, "total": 0} for model in models_results.keys()}

    for key in sorted_keys:
        row = [key]

        for model_name, model_results in models_results.items():
            if key in model_results:
                success = model_results[key]["success"]
                total = model_results[key]["total"]

                model_totals[model_name]["success"] += success
                model_totals[model_name]["total"] += total

                success_rate = (success / total * 100) if total > 0 else 0
                row.append(f"{success_rate:.2f}% | {success}/{total}")
            else:
                row.append("N/A")

        table.add_row(row)

    # Print the table
    print(table)

    # Print the overall results
    overall_row = ["Overall"]
    for model_name, totals in model_totals.items():
        success = totals["success"]
        total = totals["total"]
        success_rate = (success / total * 100) if total > 0 else 0
        overall_row.append(f"{success_rate:.2f}% | {success}/{total}")

    table.add_row(overall_row)
    print(table)

def print_model_comparison_items(models_item_results, all_cooking_items):
    print("\nModel Comparison by Cooking Item:")
    print("=" * 100)

    # Create the table
    table = PrettyTable()
    table.field_names = ["Cooking Item"] + [
        f"{model_name} (Success Rate | Success/Total)" for model_name in models_item_results.keys()
    ]

    # Calculate and add rows for each cooking item
    model_totals = {model: {"success": 0, "total": 0} for model in models_item_results.keys()}

    for item in sorted(all_cooking_items):
        row = [item]

        for model_name, model_results in models_item_results.items():
            if item in model_results:
                success = model_results[item]["success"]
                total = model_results[item]["total"]

                model_totals[model_name]["success"] += success
                model_totals[model_name]["total"] += total

                success_rate = (success / total * 100) if total > 0 else 0
                row.append(f"{success_rate:.2f}% | {success}/{total}")
            else:
                row.append("N/A")

        table.add_row(row)

    # Print the table
    print(table)

    # Print the overall results
    overall_row = ["Overall"]
    for model_name, totals in model_totals.items():
        success = totals["success"]
        total = totals["total"]
        success_rate = (success / total * 100) if total > 0 else 0
        overall_row.append(f"{success_rate:.2f}% | {success}/{total}")

    table.add_row(overall_row)
    print(table)

def print_model_comparison_items_by_blocked(models_data, all_cooking_items):
    print("\nDetailed Model Comparison by Cooking Item and Blocked Agent Count:")
    print("=" * 120)

    # For each cooking item, create a comparison table by blocked agent count
    for item in sorted(all_cooking_items):
        print(f"\nResults for cooking item: {item}")
        print("-" * 100)

        # Create the table
        table = PrettyTable()
        table.field_names = ["Blocked Agents"] + [
            f"{model_name} Success Rate" for model_name in models_data.keys()
        ] + [
            f"{model_name} Success/Total" for model_name in models_data.keys()
        ]

        # Get all possible blocked agent counts
        all_blocked_keys = set()
        for model_name, model_data in models_data.items():
            _, _, item_blocked_data = model_data
            for blocked_key in item_blocked_data.get(item, {}).keys():
                all_blocked_keys.add(blocked_key)

        # Sort the keys
        sorted_keys = sorted(all_blocked_keys, key=lambda x: int(x.split()[0]))

        # Add rows for each blocked key
        for blocked_key in sorted_keys:
            row = [blocked_key]

            for model_name, model_data in models_data.items():
                _, _, item_blocked_data = model_data

                if item in item_blocked_data and blocked_key in item_blocked_data[item]:
                    success = item_blocked_data[item][blocked_key]["success"]
                    total = item_blocked_data[item][blocked_key]["total"]

                    if total > 0:
                        success_rate = (success / total * 100)
                        row.append(f"{success_rate:.2f}%")
                        row.append(f"{success}/{total}")
                    else:
                        row.append("N/A")
                        row.append("0/0")
                else:
                    row.append("N/A")
                    row.append("N/A")

            table.add_row(row)

        # Print the table
        print(table)

        # Print item summary for each model
        overall_row = ["Overall"]
        for model_name, model_data in models_data.items():
            _, item_results, _ = model_data

            if item in item_results:
                success = item_results[item]["success"]
                total = item_results[item]["total"]

                if total > 0:
                    success_rate = (success / total * 100)
                    overall_row.append(f"{success_rate:.2f}%")
                    overall_row.append(f"{success}/{total}")
                else:
                    overall_row.append("N/A")
                    overall_row.append("0/0")
            else:
                overall_row.append("N/A")
                overall_row.append("N/A")

        table.add_row(overall_row)
        print(table)

def generate_item_blocked_data(experiments_root):
    # Organize data by item and blocked agent count
    item_blocked_data = defaultdict(lambda: defaultdict(lambda: {"success": 0, "total": 0}))
    
    # Keep track of ignored tasks
    ignored_tasks = []
    
    # Populate the data structure
    for exp_dir in os.listdir(experiments_root):
        if not os.path.isdir(os.path.join(experiments_root, exp_dir)) or not exp_dir.startswith("multiagent_cooking_"):
            continue
        
        # Extract cooking items
        cooking_items = extract_cooking_items(exp_dir)
        
        # Extract blocked access information
        blocked_access_match = re.search(r'blocked_access_([0-9_]+)$', exp_dir)
        if blocked_access_match:
            blocked_access_str = blocked_access_match.group(1)
            num_blocked_agents = len(blocked_access_str.split('_'))
            blocked_key = f"{num_blocked_agents} agent(s)"
        else:
            blocked_key = "0 agent(s)"
        
        # Check if the task was successful and if score information exists
        is_successful = False
        score_found = False
        full_exp_path = os.path.join(experiments_root, exp_dir)
        agent_files = [f for f in os.listdir(full_exp_path) if f.endswith(".json")]
        
        for agent_file in agent_files:
            try:
                with open(os.path.join(full_exp_path, agent_file), 'r') as f:
                    agent_data = json.load(f)
                    
                if "turns" in agent_data:
                    for turn in agent_data["turns"]:
                        if turn.get("role") == "system" and "content" in turn:
                            if isinstance(turn["content"], str) and "Task ended with score : " in turn["content"]:
                                score_found = True
                                if "Task ended with score : 1" in turn["content"]:
                                    is_successful = True
                                    break
                
                if is_successful:
                    break
            except:
                continue
        
        # If no score information was found, skip this task
        if not score_found:
            ignored_tasks.append(exp_dir)
            continue
            
        # Update the item-blocked data
        for item in cooking_items:
            item_blocked_data[item][blocked_key]["total"] += 1
            if is_successful:
                item_blocked_data[item][blocked_key]["success"] += 1
    
    return item_blocked_data, ignored_tasks

def analyze_cooking_log(log_file):
    # Placeholder for the actual analysis logic if it exists
    # This function needs to be implemented based on the script's purpose
    print(f"Analyzing {log_file}...") # Example print
    # Example: return a dictionary of results
    return {"file": os.path.basename(log_file), "score": 1} # Dummy result

def main():
    parser = argparse.ArgumentParser(description='Analyze cooking task logs.')
    # Change default input dir to 'experiments' relative to project root
    parser.add_argument('--log_dir', type=str, default='experiments', 
                        help='Directory containing the log files (relative to project root)')
    # Removed --output_file argument
    # parser.add_argument('--output_file', type=str, default='cooking_analysis_results.csv', 
    #                     help='Output CSV file name (relative to project root)')
    args = parser.parse_args()

    # Resolve log_dir path relative to project root
    log_dir_abs = args.log_dir
    if not os.path.isabs(log_dir_abs):
        log_dir_abs = os.path.join(project_root, log_dir_abs)
        
    # Hardcode output file path
    output_file_abs = os.path.join(analysis_output_dir, "cooking_analysis.csv")

    all_results = []
    # Use absolute log directory path
    log_pattern = os.path.join(log_dir_abs, '*.json')
    print(f"Searching for logs in: {log_pattern}")
    log_files_found = glob.glob(log_pattern)
    print(f"Found {len(log_files_found)} log files.")
    
    for log_file in log_files_found:
        results = analyze_cooking_log(log_file)
        if results:
            all_results.append(results) # Append the results dictionary
    
    if all_results:
        df = pd.DataFrame(all_results)
        # Ensure the output directory exists
        os.makedirs(os.path.dirname(output_file_abs), exist_ok=True)
        # Save to hardcoded absolute output file path
        df.to_csv(output_file_abs, index=False)
        print(f"Analysis complete. Results saved to {output_file_abs}")
    else:
        print("No results generated from log files.")

if __name__ == "__main__":
    main()