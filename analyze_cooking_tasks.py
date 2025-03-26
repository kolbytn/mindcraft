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
        
        # Update the blocked access counters
        blocked_access_results[blocked_key]["total"] += 1
        if is_successful:
            blocked_access_results[blocked_key]["success"] += 1
    
    return blocked_access_results, cooking_item_results, all_cooking_items

def print_model_comparison_blocked(models_results):
    print("\nModel Comparison by Number of Agents with Blocked Access:")
    print("=" * 100)
    
    # Get all possible blocked access keys
    all_blocked_keys = set()
    for model_results in models_results.values():
        all_blocked_keys.update(model_results.keys())
    
    # Sort the keys
    sorted_keys = sorted(all_blocked_keys, key=lambda x: int(x.split()[0]))
    
    # Create the header
    header = f"{'Blocked Agents':<15} | "
    for model_name in models_results.keys():
        header += f"{model_name+' Success Rate':<20} | {model_name+' Success/Total':<20} | "
    print(header)
    print("-" * 100)
    
    # Calculate and print the results for each blocked key
    model_totals = {model: {"success": 0, "total": 0} for model in models_results.keys()}
    
    for key in sorted_keys:
        row = f"{key:<15} | "
        
        for model_name, model_results in models_results.items():
            if key in model_results:
                success = model_results[key]["success"]
                total = model_results[key]["total"]
                
                model_totals[model_name]["success"] += success
                model_totals[model_name]["total"] += total
                
                success_rate = (success / total * 100) if total > 0 else 0
                row += f"{success_rate:>6.2f}%{'':<12} | {success}/{total}{'':<12} | "
            else:
                row += f"{'N/A':<19} | {'N/A':<19} | "
        
        print(row)
    
    # Print the overall results
    print("-" * 100)
    row = f"{'Overall':<15} | "
    
    for model_name, totals in model_totals.items():
        success = totals["success"]
        total = totals["total"]
        success_rate = (success / total * 100) if total > 0 else 0
        row += f"{success_rate:>6.2f}%{'':<12} | {success}/{total}{'':<12} | "
    
    print(row)

def print_model_comparison_items(models_item_results, all_cooking_items):
    print("\nModel Comparison by Cooking Item:")
    print("=" * 100)
    
    # Create the header
    header = f"{'Cooking Item':<20} | "
    for model_name in models_item_results.keys():
        header += f"{model_name+' Success Rate':<20} | {model_name+' Success/Total':<20} | "
    print(header)
    print("-" * 100)
    
    # Calculate and print the results for each cooking item
    model_totals = {model: {"success": 0, "total": 0} for model in models_item_results.keys()}
    
    for item in sorted(all_cooking_items):
        row = f"{item:<20} | "
        
        for model_name, model_results in models_item_results.items():
            if item in model_results:
                success = model_results[item]["success"]
                total = model_results[item]["total"]
                
                model_totals[model_name]["success"] += success
                model_totals[model_name]["total"] += total
                
                success_rate = (success / total * 100) if total > 0 else 0
                row += f"{success_rate:>6.2f}%{'':<12} | {success}/{total}{'':<12} | "
            else:
                row += f"{'N/A':<19} | {'N/A':<19} | "
        
        print(row)
    
    # Print the overall results
    print("-" * 100)
    row = f"{'Overall':<20} | "
    
    for model_name, totals in model_totals.items():
        success = totals["success"]
        total = totals["total"]
        success_rate = (success / total * 100) if total > 0 else 0
        row += f"{success_rate:>6.2f}%{'':<12} | {success}/{total}{'':<12} | "
    
    print(row)

def print_model_comparison_items_by_blocked(models_data, all_cooking_items):
    print("\nDetailed Model Comparison by Cooking Item and Blocked Agent Count:")
    print("=" * 120)
    
    # For each cooking item, create a comparison table by blocked agent count
    for item in sorted(all_cooking_items):
        print(f"\nResults for cooking item: {item}")
        print("-" * 100)
        
        # Create the header
        header = f"{'Blocked Agents':<15} | "
        for model_name in models_data.keys():
            header += f"{model_name+' Success Rate':<20} | {model_name+' Success/Total':<20} | "
        print(header)
        print("-" * 100)
        
        # Get all possible blocked agent counts
        all_blocked_keys = set()
        for model_name, model_data in models_data.items():
            _, _, item_blocked_data = model_data
            for blocked_key in item_blocked_data.get(item, {}).keys():
                all_blocked_keys.add(blocked_key)
        
        # Sort the keys
        sorted_keys = sorted(all_blocked_keys, key=lambda x: int(x.split()[0]))
        
        # Print each row
        for blocked_key in sorted_keys:
            row = f"{blocked_key:<15} | "
            
            for model_name, model_data in models_data.items():
                _, _, item_blocked_data = model_data
                
                if item in item_blocked_data and blocked_key in item_blocked_data[item]:
                    success = item_blocked_data[item][blocked_key]["success"]
                    total = item_blocked_data[item][blocked_key]["total"]
                    
                    if total > 0:
                        success_rate = (success / total * 100)
                        row += f"{success_rate:>6.2f}%{'':<12} | {success}/{total}{'':<12} | "
                    else:
                        row += f"{'N/A':<19} | {'0/0':<19} | "
                else:
                    row += f"{'N/A':<19} | {'N/A':<19} | "
            
            print(row)
        
        # Print item summary for each model
        print("-" * 100)
        row = f"{'Overall':<15} | "
        
        for model_name, model_data in models_data.items():
            _, item_results, _ = model_data
            
            if item in item_results:
                success = item_results[item]["success"]
                total = item_results[item]["total"]
                
                if total > 0:
                    success_rate = (success / total * 100)
                    row += f"{success_rate:>6.2f}%{'':<12} | {success}/{total}{'':<12} | "
                else:
                    row += f"{'N/A':<19} | {'0/0':<19} | "
            else:
                row += f"{'N/A':<19} | {'N/A':<19} | "
        
        print(row)

def generate_item_blocked_data(experiments_root):
    # Organize data by item and blocked agent count
    item_blocked_data = defaultdict(lambda: defaultdict(lambda: {"success": 0, "total": 0}))
    
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
        
        # Check if the task was successful
        is_successful = False
        full_exp_path = os.path.join(experiments_root, exp_dir)
        agent_files = [f for f in os.listdir(full_exp_path) if f.endswith(".json")]
        
        for agent_file in agent_files:
            try:
                with open(os.path.join(full_exp_path, agent_file), 'r') as f:
                    agent_data = json.load(f)
                    
                if "turns" in agent_data:
                    for turn in agent_data["turns"]:
                        if turn.get("role") == "system" and "content" in turn:
                            if isinstance(turn["content"], str) and "Task ended with score : 1" in turn["content"]:
                                is_successful = True
                                break
                
                if is_successful:
                    break
            except:
                continue
        
        # Update the item-blocked data
        for item in cooking_items:
            item_blocked_data[item][blocked_key]["total"] += 1
            if is_successful:
                item_blocked_data[item][blocked_key]["success"] += 1
    
    return item_blocked_data

def main():
    base_dir = "experiments"
    
    # Get the model directories
    all_model_dirs = [d for d in os.listdir(base_dir) if os.path.isdir(os.path.join(base_dir, d))]
    gpt_dirs = [d for d in all_model_dirs if d.startswith("gpt-4o_30_cooking_tasks")]
    claude_dirs = [d for d in all_model_dirs if d.startswith("llama_70b_30_cooking_tasks")]
    
    if not gpt_dirs or not claude_dirs:
        print("Error: Could not find both model directories. Please check your paths.")
        return
    
    # Use the first directory found for each model
    gpt_dir = os.path.join(base_dir, gpt_dirs[0])
    claude_dir = os.path.join(base_dir, claude_dirs[0])
    
    print(f"Analyzing GPT-4o experiments in: {gpt_dir}")
    print(f"Analyzing Claude-3.5-Sonnet experiments in: {claude_dir}")
    
    # Analyze each model directory
    gpt_blocked_results, gpt_item_results, gpt_unique_items = analyze_experiments(gpt_dir, "GPT-4o")
    claude_blocked_results, claude_item_results, claude_unique_items = analyze_experiments(claude_dir, "Claude-3.5")
    
    # Combine unique cooking items
    all_cooking_items = gpt_unique_items.union(claude_unique_items)
    
    # Generate item-blocked data for each model
    gpt_item_blocked_data = generate_item_blocked_data(gpt_dir)
    claude_item_blocked_data = generate_item_blocked_data(claude_dir)
    
    # Create model comparison data structures
    models_blocked_results = {
        "GPT-4o": gpt_blocked_results,
        "Claude-3.5": claude_blocked_results
    }
    
    models_item_results = {
        "GPT-4o": gpt_item_results,
        "Claude-3.5": claude_item_results
    }
    
    models_data = {
        "GPT-4o": (gpt_blocked_results, gpt_item_results, gpt_item_blocked_data),
        "Claude-3.5": (claude_blocked_results, claude_item_results, claude_item_blocked_data)
    }
    
    # Print the comparison tables
    print_model_comparison_blocked(models_blocked_results)
    print_model_comparison_items(models_item_results, all_cooking_items)
    print_model_comparison_items_by_blocked(models_data, all_cooking_items)
    
    # Print overall statistics
    print("\nUnique Cooking Items Found:")
    print("=" * 60)
    print(", ".join(sorted(all_cooking_items)))
    print(f"Total unique items: {len(all_cooking_items)}")

if __name__ == "__main__":
    main()