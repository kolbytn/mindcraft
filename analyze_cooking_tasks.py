import os
import json
import re
from collections import defaultdict

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

def analyze_experiments(root_dir):
    # Store results by number of blocked agents
    blocked_access_results = defaultdict(lambda: {
        "success": 0, 
        "total": 0,
        "cake_success": 0,
        "cake_total": 0,
        "non_cake_success": 0,
        "non_cake_total": 0
    })
    
    # Store results by cooking item
    cooking_item_results = defaultdict(lambda: {
        "success": 0,
        "total": 0
    })
    
    # Keep track of all unique cooking items
    all_cooking_items = set()
    
    # Get a list of all experiment directories
    experiment_dirs = [d for d in os.listdir(root_dir) if os.path.isdir(os.path.join(root_dir, d)) 
                      and d.startswith("multiagent_cooking_")]
    
    for exp_dir in experiment_dirs:
        # Extract cooking items
        cooking_items = extract_cooking_items(exp_dir)
        
        # Add to unique items set
        all_cooking_items.update(cooking_items)
        
        # Check if experiment involves cake
        has_cake = any(item == "cake" for item in cooking_items)
        
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
        full_exp_path = os.path.join(root_dir, exp_dir)
        
        # Get all JSON files in the experiment directory
        agent_files = [f for f in os.listdir(full_exp_path) if f.endswith(".json")]
        
        # Check each agent file for success information
        for agent_file in agent_files:
            agent_file_path = os.path.join(full_exp_path, agent_file)
            
            try:
                with open(agent_file_path, 'r') as f:
                    agent_data = json.load(f)
                    
                # Check for success in the turns data
                if "turns" in agent_data:
                    for turn in agent_data["turns"]:
                        if turn.get("role") == "system" and "content" in turn:
                            if isinstance(turn["content"], str) and "Task ended with score : 1" in turn["content"]:
                                is_successful = True
                                break
                
                # If we found success, no need to check other files
                if is_successful:
                    break
                    
            except (json.JSONDecodeError, IOError) as e:
                print(f"Error reading {agent_file_path}: {e}")
                # Continue to check other agent files instead of failing
                continue
        
        # Update cooking item results
        for item in cooking_items:
            cooking_item_results[item]["total"] += 1
            if is_successful:
                cooking_item_results[item]["success"] += 1
        
        # Update the appropriate blocked access counters
        # First update the category-specific counters
        if has_cake:
            blocked_access_results[blocked_key]["cake_total"] += 1
            if is_successful:
                blocked_access_results[blocked_key]["cake_success"] += 1
        else:
            blocked_access_results[blocked_key]["non_cake_total"] += 1
            if is_successful:
                blocked_access_results[blocked_key]["non_cake_success"] += 1
            
            # Only count non-cake experiments in the main totals
            blocked_access_results[blocked_key]["total"] += 1
            if is_successful:
                blocked_access_results[blocked_key]["success"] += 1
    
    return blocked_access_results, cooking_item_results, all_cooking_items

def print_blocked_results(results):
    print("\nExperiment Results by Number of Agents with Blocked Access (Excluding Cake Experiments):")
    print("=" * 80)
    print(f"{'Blocked Agents':<15} | {'Success Rate':<15} | {'Success/Total':<15} | {'Cake Tasks':<15} | {'Non-Cake Tasks':<15}")
    print("-" * 80)
    
    # Calculate totals
    total_success = 0
    total_experiments = 0
    total_cake = 0
    total_non_cake = 0
    
    # Sort by number of blocked agents
    for key in sorted(results.keys(), key=lambda x: int(x.split()[0])):
        success = results[key]["success"]
        total = results[key]["total"]
        cake_total = results[key]["cake_total"]
        non_cake_total = results[key]["non_cake_total"]
        
        # Verify that non_cake_total matches total
        if non_cake_total != total:
            print(f"Warning: Non-cake total ({non_cake_total}) doesn't match the total ({total}) for {key}")
        
        total_success += success
        total_experiments += total
        total_cake += cake_total
        total_non_cake += non_cake_total
        
        success_rate = (success / total * 100) if total > 0 else 0
        
        print(f"{key:<15} | {success_rate:>6.2f}%        | {success}/{total:<13} | {cake_total:<15} | {non_cake_total:<15}")
    
    # Calculate overall success rate (excluding cake experiments)
    overall_success_rate = (total_success / total_experiments * 100) if total_experiments > 0 else 0
    
    print("-" * 80)
    print(f"{'Overall':<15} | {overall_success_rate:>6.2f}%        | {total_success}/{total_experiments:<13} | {total_cake:<15} | {total_non_cake:<15}")
    
    # Print cake experiment details
    print("\nCake Experiment Details:")
    print("=" * 60)
    print(f"{'Blocked Agents':<15} | {'Success Rate':<15} | {'Success/Total':<15}")
    print("-" * 60)
    
    cake_total_success = 0
    cake_total_experiments = 0
    
    for key in sorted(results.keys(), key=lambda x: int(x.split()[0])):
        cake_success = results[key]["cake_success"]
        cake_total = results[key]["cake_total"]
        
        cake_total_success += cake_success
        cake_total_experiments += cake_total
        
        cake_success_rate = (cake_success / cake_total * 100) if cake_total > 0 else 0
        
        print(f"{key:<15} | {cake_success_rate:>6.2f}%        | {cake_success}/{cake_total}")
    
    cake_overall_success_rate = (cake_total_success / cake_total_experiments * 100) if cake_total_experiments > 0 else 0
    
    print("-" * 60)
    print(f"{'Overall':<15} | {cake_overall_success_rate:>6.2f}%        | {cake_total_success}/{cake_total_experiments}")

def print_cooking_items(cooking_items):
    print("\nUnique Cooking Items Found:")
    print("=" * 60)
    print(", ".join(sorted(cooking_items)))
    print(f"Total unique items: {len(cooking_items)}")

def print_item_results(item_results):
    print("\nExperiment Results by Cooking Item:")
    print("=" * 60)
    print(f"{'Cooking Item':<20} | {'Success Rate':<15} | {'Success/Total':<15}")
    print("-" * 60)
    
    # Sort by item name
    for item in sorted(item_results.keys()):
        success = item_results[item]["success"]
        total = item_results[item]["total"]
        success_rate = (success / total * 100) if total > 0 else 0
        
        print(f"{item:<20} | {success_rate:>6.2f}%        | {success}/{total}")
    
    print("-" * 60)

def main():
    # Update this path to your experiments directory
    experiments_root = "../results/llama_70b_hells_kitchen_cooking_tasks"
    
    print(f"Analyzing experiments in: {os.path.abspath(experiments_root)}")
    blocked_results, item_results, unique_items = analyze_experiments(experiments_root)
    
    print_blocked_results(blocked_results)
    print_cooking_items(unique_items)
    print_item_results(item_results)

if __name__ == "__main__":
    main()