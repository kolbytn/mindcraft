import json
import re
import statistics
import random
import os

def extract_difficulty(task_name):
    """Extract difficulty parameters from the task name."""
    match = re.search(r'materials_(\d+)_rooms_(\d+)_window_(\d+)_carpet_(\d+)_variant_\d+', task_name)
    if match:
        return tuple(map(int, match.groups()))  # (m, r, w, c)
    return (0, 0, 0, 0)  # Default to lowest difficulty if not found

def calculate_difficulty_score(task_name, task, alpha=1.0, beta=3.0):
    """Compute a difficulty score based on parameters."""
    m, r, w, c = extract_difficulty(task_name)
    num_levels = len(task.get("blueprint", {}).get("levels", []))
    
    # Higher values mean more difficulty
    score = (m*4 + r*10 + w*2 + c*1)
    return score

def process_json(file_path, output_path, alpha=1.0, beta=3.0):
    """Process the JSON file to count tasks, quantify difficulty, and filter easiest 30."""
    with open(file_path, 'r') as f:
        data = json.load(f)
    
    # Count total tasks
    total_tasks = len(data)
    print(f"Total tasks: {total_tasks}")
    
    # Compute difficulty scores for tasks with at least 3 levels
    task_difficulties = []
    filtered_out = 0
    
    for task_name, task_details in data.items():
        num_levels = len(task_details.get("blueprint", {}).get("levels", []))
        
        # Skip tasks with fewer than 3 levels
        if num_levels < 3:
            filtered_out += 1
            continue
            
        score = calculate_difficulty_score(task_name, task_details, alpha, beta)
        task_difficulties.append((task_name, score, task_details))
    
    print(f"Filtered out {filtered_out} tasks with fewer than 3 levels")
    print(f"Remaining tasks after filtering: {len(task_difficulties)}")
    
    # Calculate statistics on the filtered tasks
    if task_difficulties:
        difficulty_scores = [score for _, score, _ in task_difficulties]
        stats = {
            "mean": statistics.mean(difficulty_scores),
            "median": statistics.median(difficulty_scores),
            "min": min(difficulty_scores),
            "max": max(difficulty_scores),
        }
        print(f"Difficulty Statistics for Overall Tasks: {stats}")
    else:
        stats = {"mean": 0, "median": 0, "min": 0, "max": 0}
        print("No tasks remaining after filtering!")
    
    # Sort tasks by difficulty (ascending)
    task_difficulties.sort(key=lambda x: x[1])
    
    # Get the 30 easiest tasks (or all if less than 30)
    num_tasks_to_select = min(30, len(task_difficulties))
    easiest_tasks = {task[0]: task[2] for task in task_difficulties[:num_tasks_to_select]}

    # Difficulty scores of the easiest tasks
    easiest_difficulty_scores = [score for _, score, _ in task_difficulties[:num_tasks_to_select]]
    easiest_stats = {
        "mean": statistics.mean(easiest_difficulty_scores),
        "median": statistics.median(easiest_difficulty_scores),
        "min": min(easiest_difficulty_scores),
        "max": max(easiest_difficulty_scores),
    }
    print(f"Difficulty Statistics for Easiest Tasks: {easiest_stats}")

    # Add a group by of all unique (m, r, w, c) combinations in the easiest tasks
    unique_difficulties = {}
    for task_name, _, task_details in task_difficulties[:num_tasks_to_select]:
        m, r, w, c = extract_difficulty(task_name)
        unique_difficulties[(m, r, w, c)] = unique_difficulties.get((m, r, w, c), 0) + 1

    print(f"Unique (m, r, w, c) combinations in the easiest tasks:")
    for difficulty, count in unique_difficulties.items():
        print(f"  {difficulty}: {count} tasks")
    
    # Add statistics to output
    output_data = easiest_tasks
    
    # Save to output file
    with open(output_path, 'w') as f:
        json.dump(output_data, f, indent=4)
    
    print(f"Saved {num_tasks_to_select} easiest tasks with statistics to {output_path}")

def sample_tasks_with_distribution(file_path, output_path):
    """
    Sample tasks with a specific distribution:
    - 3 tasks for each of the 9 possibilities of (m,r) where 0 <= m <= 2 and 0 <= r <= 2
    - Random (w,c) between 0 and 1 for the above tasks
    - 2 additional tasks from (m,r,w,c) = (0,0,0,0)
    - 1 additional task from (m,r,w,c) = (1,0,0,0)
    """
    with open(file_path, 'r') as f:
        data = json.load(f)
    
    # Filter tasks with at least 3 levels
    valid_tasks = {}
    for task_name, task_details in data.items():
        num_levels = len(task_details.get("blueprint", {}).get("levels", []))
        if num_levels >= 3:
            valid_tasks[task_name] = task_details
    
    # print(f"Total valid tasks: {len(valid_tasks)}")
    
    # Categorize tasks by their (m,r,w,c) values
    tasks_by_params = {}
    for task_name, task_details in valid_tasks.items():
        m, r, w, c = extract_difficulty(task_name)
        key = (m, r, w, c)
        if key not in tasks_by_params:
            tasks_by_params[key] = []
        tasks_by_params[key].append((task_name, task_details))
    
    # # Print available combinations
    # print("Available (m,r,w,c) combinations:")
    # for params, tasks in tasks_by_params.items():
    #     print(f"  {params}: {len(tasks)} tasks")
    
    # Sample tasks according to the distribution
    sampled_tasks = {}
    already_sampled = set()
    
    # 1. Sample 3 tasks for each (m,r) where 0 <= m <= 2 and 0 <= r <= 2
    for m in range(3):
        for r in range(3):
            # Find all tasks with the current (m,r) and w,c between 0 and 1
            candidates = []
            for params, tasks in tasks_by_params.items():
                if params[0] == m and params[1] == r and params[2] <= 1 and params[3] <= 1:
                    candidates.extend(tasks)
            
            # Sample 3 tasks if possible
            if len(candidates) >= 3:
                sampled = random.sample(candidates, 3)
                for task_name, task_details in sampled:
                    if task_name not in already_sampled:
                        sampled_tasks[task_name] = task_details
                        already_sampled.add(task_name)
            else:
                print(f"Warning: Not enough tasks for (m={m}, r={r}) with w,c <= 1. Found {len(candidates)}.")
                # Add all available
                for task_name, task_details in candidates:
                    if task_name not in already_sampled:
                        sampled_tasks[task_name] = task_details
                        already_sampled.add(task_name)
    
    # 2. Add 2 tasks with (m,r,w,c) = (0,0,0,0)
    zero_zero_zero_zero = tasks_by_params.get((0,0,0,0), [])
    zero_zero_zero_zero = [t for t in zero_zero_zero_zero if t[0] not in already_sampled]
    
    if len(zero_zero_zero_zero) >= 2:
        additional = random.sample(zero_zero_zero_zero, 2)
        for task_name, task_details in additional:
            sampled_tasks[task_name] = task_details
            already_sampled.add(task_name)
    else:
        print(f"Warning: Not enough tasks for (0,0,0,0). Found {len(zero_zero_zero_zero)}.")
        for task_name, task_details in zero_zero_zero_zero:
            sampled_tasks[task_name] = task_details
            already_sampled.add(task_name)
    
    # 3. Add 1 task with (m,r,w,c) = (1,0,0,0)
    one_zero_zero_zero = tasks_by_params.get((1,0,0,0), [])
    one_zero_zero_zero = [t for t in one_zero_zero_zero if t[0] not in already_sampled]
    
    if len(one_zero_zero_zero) >= 1:
        additional = random.sample(one_zero_zero_zero, 1)
        for task_name, task_details in additional:
            sampled_tasks[task_name] = task_details
            already_sampled.add(task_name)
    else:
        print(f"Warning: Not enough tasks for (1,0,0,0). Found {len(one_zero_zero_zero)}.")
        for task_name, task_details in one_zero_zero_zero:
            sampled_tasks[task_name] = task_details
            already_sampled.add(task_name)
    
    # Print summary of sampled tasks
    print(f"\nTotal sampled tasks: {len(sampled_tasks)}")
    
    # Count tasks by their (m,r) values
    distribution = {}
    for task_name in sampled_tasks:
        m, r, w, c = extract_difficulty(task_name)
        key = (m, r)
        if key not in distribution:
            distribution[key] = []
        distribution[key].append((w, c))
    
    print("\nDistribution of sampled tasks:")
    for mr, wc_list in distribution.items():
        print(f"  (m={mr[0]}, r={mr[1]}): {len(wc_list)} tasks")
        for wc in wc_list:
            print(f"    (w={wc[0]}, c={wc[1]})")
    
    # Check for duplicates in sampled tasks
    if len(sampled_tasks) != len(set(sampled_tasks.keys())):
        print("\nWARNING: Duplicate tasks detected!")
        
        # Find the duplicates
        task_counts = {}
        for task_name in sampled_tasks.keys():
            task_counts[task_name] = task_counts.get(task_name, 0) + 1
        
        duplicates = [task for task, count in task_counts.items() if count > 1]
        print(f"Duplicate tasks: {duplicates}")
    else:
        print("\nVerification: No duplicates found in the sampled tasks.")
    
    # Save to output file
    with open(output_path, 'w') as f:
        json.dump(sampled_tasks, f, indent=4)
    
    print(f"\nSaved {len(sampled_tasks)} distributed tasks to {output_path}")

# Example usage:
# process_json('test/2agents.json', 'test/2_agents_easiest_tasks.json', alpha=1.0, beta=3.0)
# Iterate through files in tasks folder
tasks_dir = 'test'
for filename in os.listdir(tasks_dir):
    if filename.endswith('agents.json'):
        input_path = os.path.join(tasks_dir, filename)
        # Create output filename by replacing .json with _distributed_tasks.json
        output_filename = filename.replace('.json', '_distributed_tasks.json')
        output_path = os.path.join(tasks_dir, output_filename)
        print(f"\nProcessing {filename}...")
        sample_tasks_with_distribution(input_path, output_path)