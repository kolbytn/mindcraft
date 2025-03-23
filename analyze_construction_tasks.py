import os
import json
from collections import defaultdict
from prettytable import PrettyTable
import re

def extract_success_scores(root_dir):
    task_scores = {}  # Stores task-wise scores
    material_groups = defaultdict(list)
    room_groups = defaultdict(list)
    
    # Regex pattern to extract material and room numbers
    pattern = re.compile(r"materials_(\d+)_rooms_(\d+)")

    # Iterate through each task folder
    for task_folder in os.listdir(root_dir):
        task_path = os.path.join(root_dir, task_folder)
        if os.path.isdir(task_path):
            logs_found = False  # Flag to track if logs exist
            
            # Check for JSON files
            for file_name in os.listdir(task_path):
                if file_name.endswith(".json"): 
                    logs_found = True  # JSON file exists
                    file_path = os.path.join(task_path, file_name)
                    
                    # Read JSON file
                    try:
                        with open(file_path, 'r') as file:
                            data = json.load(file)
                            
                            # Extract success score from the last system message
                            for turn in reversed(data.get("turns", [])):
                                if turn["role"] == "system" and "Task ended with score" in turn["content"]:
                                    score = float(turn["content"].split(":")[-1].strip())
                                    task_scores[task_folder] = score  # Store per-task score
                                    break  # Stop searching if found
                            
                            # Stop checking other files in the folder if score is found
                            if task_folder in task_scores:
                                break 
                    except Exception as e:
                        print(f"Error reading {file_path}: {e}")
            
            # If no logs were found, print a message
            if not logs_found:
                print(f"No log files found in {task_folder}")

    # Group scores by material and room
    for task, score in task_scores.items():
        match = pattern.search(task)
        if match:
            material = int(match.group(1))  # Extract material number
            room = int(match.group(2))  # Extract room number
            material_groups[material].append(score)
            room_groups[room].append(score)
        else:
            print(f"Warning: Task folder '{task}' does not match expected format.")

    # Calculate average scores
    def calculate_average(group):
        return {key: sum(values) / len(values) for key, values in group.items()}

    avg_material_scores = calculate_average(material_groups)
    avg_room_scores = calculate_average(room_groups)

    # Display results using PrettyTable
    def display_table(title, data):
        table = PrettyTable(["Category", "Average Score"])
        for key, value in sorted(data.items()):
            table.add_row([key, round(value, 2)])
        print(f"\n{title}")
        print(table)

    def display_task_scores():
        table = PrettyTable(["Task", "Success Score"])
        for task, score in sorted(task_scores.items()):
            table.add_row([task, round(score, 2)])
        print("\nTask-wise Success Scores")
        print(table)

    # Print all tables
    display_task_scores()
    display_table("Average Success Score by Material (Grouped by Number)", avg_material_scores)
    display_table("Average Success Score by Room (Grouped by Number)", avg_room_scores)

# Example usage (replace 'root_directory' with actual path)
root_directory = "experiments/exp_03-22_19-29"
extract_success_scores(root_directory)