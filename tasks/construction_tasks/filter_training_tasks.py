import json
import re
import random
import os
from collections import defaultdict

def extract_difficulty(task_name):
    """Extract difficulty parameters from the task name."""
    match = re.search(r'materials_(\d+)_rooms_(\d+)_window_(\d+)_carpet_(\d+)_variant_\d+', task_name)
    if match:
        return tuple(map(int, match.groups()))  # (m, r, w, c)
    return (0, 0, 0, 0)  # Default if not found

def filter_and_sample_tasks(file_path, output_path):
    """Filters, samples, and saves 500 unique tasks based on given criteria."""
    with open(file_path, 'r') as f:
        data = json.load(f)

    total_tasks = len(data)
    print(f"\nProcessing file: {file_path}")
    print(f"Total available tasks: {total_tasks}")

    valid_tasks = {}

    # Filter tasks with at least 3 levels
    for task_name, task_details in data.items():
        num_levels = len(task_details.get("blueprint", {}).get("levels", []))
        if num_levels >= 3:
            valid_tasks[task_name] = task_details

    print(f"Tasks with at least 3 levels: {len(valid_tasks)}")

    # Organize tasks by difficulty parameters (m, r, w, c)
    tasks_by_params = defaultdict(list)
    for task_name, task_details in valid_tasks.items():
        key = extract_difficulty(task_name)
        tasks_by_params[key].append((task_name, task_details))

    # Sort keys in increasing order
    sorted_keys = sorted(tasks_by_params.keys())
    sampled_tasks = {}
    total_selected = 0
    sampled_task_counts = defaultdict(int)
    
    # Pick tasks sequentially until 500 are collected
    for key in sorted_keys:
        if total_selected >= 500:
            break
        
        if key in tasks_by_params:
            candidates = tasks_by_params[key]
            for task_name, task_details in candidates:
                if total_selected < 500:
                    sampled_tasks[task_name] = task_details
                    sampled_task_counts[key] += 1  # Keep the key as a tuple
                    total_selected += 1
                else:
                    break
    
    print(f"\nTotal sampled tasks: {len(sampled_tasks)}")

    # Print task count per (m, r, w, c) tuple
    print("\nTask count per (m, r, w, c):")
    for key, count in sorted(sampled_task_counts.items()):
        print(f"{key}: {count}")

    # Randomly shuffle the tasks before saving
    shuffled_tasks = list(sampled_tasks.items())
    random.shuffle(shuffled_tasks)
    final_tasks = dict(shuffled_tasks)
    
    # Save sampled tasks to JSON
    with open(output_path, 'w') as f:
        json.dump(final_tasks, f, indent=4)

    print(f"\nSaved {len(final_tasks)} tasks to {output_path}")

# Process all relevant files
tasks_dir = 'train'
all_filenames = [f for f in os.listdir(tasks_dir) if f.endswith('agents.json')]
all_filenames.sort()

for i, filename in enumerate(all_filenames):
    input_path = os.path.join(tasks_dir, filename)
    output_filename = filename.replace('.json', '_sampled_tasks_for_training.json')
    output_path = os.path.join(tasks_dir, output_filename)
    filter_and_sample_tasks(input_path, output_path)