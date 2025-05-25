import os
import json
from collections import defaultdict
from prettytable import PrettyTable
import re
import argparse
import pandas as pd
import glob

# Calculate project root directory
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Define output directory for analysis results
analysis_output_dir = os.path.join(project_root, "experiments", "analysis_results")
# Ensure the output directory exists
os.makedirs(analysis_output_dir, exist_ok=True)

def extract_success_scores(folders, model_names):
    assert len(folders) == len(model_names), "Folders and model names lists must have the same length."
    
    all_task_scores = defaultdict(dict)  # Stores task-wise scores per model
    zero_score_tasks = defaultdict(list)  # Stores tasks with 0 score per model
    material_groups = defaultdict(lambda: defaultdict(list))
    room_groups = defaultdict(lambda: defaultdict(list))
    material_room_groups = defaultdict(lambda: defaultdict(list))
    overall_scores = defaultdict(list)  # New dict to store all scores for each model
    skipped_tasks = defaultdict(list)  # Stores tasks with no score message per model
    
    pattern = re.compile(r"materials_(\d+)_rooms_(\d+)")
    
    for root_dir, model_name in zip(folders, model_names):
        for task_folder in os.listdir(root_dir):
            task_path = os.path.join(root_dir, task_folder)
            if os.path.isdir(task_path):
                logs_found = False
                score_found = False
                
                for file_name in os.listdir(task_path):
                    if file_name.endswith(".json"): 
                        logs_found = True
                        file_path = os.path.join(task_path, file_name)
                        
                        try:
                            with open(file_path, 'r') as file:
                                data = json.load(file)
                                
                                for turn in reversed(data.get("turns", [])):
                                    if turn["role"] == "system" and "Task ended with score" in turn["content"]:
                                        score = float(turn["content"].split(":")[-1].strip())
                                        all_task_scores[task_folder][model_name] = score
                                        overall_scores[model_name].append(score)  # Add to overall scores
                                        score_found = True
                                        
                                        if score == 0:
                                            zero_score_tasks[model_name].append(task_folder)
                                        break 
                                
                            if score_found:
                                break 
                        except Exception as e:
                            print(f"Error reading {file_path}: {e}")
                
                if logs_found and not score_found:
                    # Score not found but logs exist - skip this task
                    skipped_tasks[model_name].append(task_folder)
                    print(f"Error: No score message found for task '{task_folder}' with model '{model_name}'. Skipping this task.")
                
                if not logs_found:
                    print(f"No log files found in {task_folder}")
    
    # Calculate model completion rates (only consider tasks with scores)
    model_completion_rates = {}
    for model_name in model_names:
        valid_tasks = [task for task in all_task_scores.keys() if model_name in all_task_scores[task]]
        total_tasks = len(valid_tasks)
        completed_tasks = len([task for task in valid_tasks if all_task_scores[task][model_name] > 0])
        model_completion_rates[model_name] = (completed_tasks / total_tasks) if total_tasks > 0 else 0
    
    # Process task scores into groups (ignore 0 scores)
    for task, model_scores in all_task_scores.items():
        match = pattern.search(task)
        if match:
            material = int(match.group(1))
            room = int(match.group(2))
            
            for model, score in model_scores.items():
                if score > 0:  # Ignore 0 scores
                    material_groups[material][model].append(score)
                    room_groups[room][model].append(score)
                    material_room_groups[(material, room)][model].append(score)
    
    def calculate_average(group):
        return {key: {model: sum(scores) / len(scores) for model, scores in models.items() if scores} 
                for key, models in group.items() if models}
    
    avg_material_scores = calculate_average(material_groups)
    avg_room_scores = calculate_average(room_groups)
    avg_material_room_scores = calculate_average(material_room_groups)
    
    def display_table(title, data, tuple_keys=False):
        table = PrettyTable(["Category"] + model_names)
        for key, model_scores in sorted(data.items()):
            key_display = key if not tuple_keys else f"({key[0]}, {key[1]})"
            row = [key_display] + [round(model_scores.get(model, 0), 2) for model in model_names]
            table.add_row(row)
        print(f"\n{title}")
        print(table)
    
    def display_task_scores():
        table = PrettyTable(["Task"] + model_names)
        for task in sorted(all_task_scores.keys()):
            row = [task]
            for model in model_names:
                score = all_task_scores[task].get(model)
                if score is None:
                    row.append("-")
                else:
                    row.append(round(score, 2))
            table.add_row(row)
        print("\nTask-wise Success Scores")
        print(table)
    
    def display_zero_and_skipped_tasks():
        for model in model_names:
            if zero_score_tasks[model]:
                table = PrettyTable([f"{model} - Tasks with 0 Score"])
                for task in zero_score_tasks[model]:
                    table.add_row([task])
                print(f"\n{model} - Tasks with 0 Success Score")
                print(table)
            
            if skipped_tasks[model]:
                table = PrettyTable([f"{model} - Skipped Tasks (No Score Message)"])
                for task in skipped_tasks[model]:
                    table.add_row([task])
                print(f"\n{model} - Skipped Tasks (No Score Message)")
                print(table)
    
    def display_overall_averages():
        table = PrettyTable(["Metric"] + model_names)
        
        # Overall average score (including zeros)
        row_with_zeros = ["Average Score (All Tasks)"]
        for model in model_names:
            valid_scores = overall_scores[model]
            avg = sum(valid_scores) / len(valid_scores) if valid_scores else 0
            row_with_zeros.append(round(avg, 2))
        table.add_row(row_with_zeros)
        
        # Overall average score (excluding zeros)
        row_without_zeros = ["Average Score (Completed Tasks)"]
        for model in model_names:
            completed_scores = [s for s in overall_scores[model] if s > 0]
            avg = sum(completed_scores) / len(completed_scores) if completed_scores else 0
            row_without_zeros.append(round(avg, 2))
        table.add_row(row_without_zeros)
        
        # Task completion rate
        completion_row = ["Task Completion Rate (%)"]
        for model in model_names:
            completion_row.append(round(model_completion_rates[model] * 100, 2))
        table.add_row(completion_row)
        
        # Total number of tasks
        task_count_row = ["Total Tasks"]
        for model in model_names:
            valid_tasks = [task for task in all_task_scores.keys() if model in all_task_scores[task]]
            task_count_row.append(len(valid_tasks))
        table.add_row(task_count_row)
        
        # Number of skipped tasks
        skipped_count_row = ["Skipped Tasks"]
        for model in model_names:
            skipped_count_row.append(len(skipped_tasks[model]))
        table.add_row(skipped_count_row)
        
        print("\nOverall Performance Metrics")
        print(table)
    
    display_overall_averages()  # Display overall averages first
    display_task_scores()
    display_zero_and_skipped_tasks()
    display_table("Average Success Score by Material", avg_material_scores)
    display_table("Average Success Score by Room", avg_room_scores)
    display_table("Average Success Score by (Material, Room) Tuples", avg_material_room_scores, tuple_keys=True)


def main():
    parser = argparse.ArgumentParser(description='Analyze construction task logs.')
    # Change default input dir to 'experiments' relative to project root
    parser.add_argument('--log_dir', type=str, default='experiments', 
                        help='Directory containing the log files (relative to project root)')
    # Removed --output_file argument
    # parser.add_argument('--output_file', type=str, default='construction_analysis_results.csv', 
    #                     help='Output CSV file name (relative to project root)')
    args = parser.parse_args()

    # Resolve log_dir path relative to project root
    log_dir_abs = args.log_dir
    if not os.path.isabs(log_dir_abs):
        log_dir_abs = os.path.join(project_root, log_dir_abs)
        
    # Hardcode output file path
    output_file_abs = os.path.join(analysis_output_dir, "construction_analysis.csv")

    all_results = []
    # Use absolute log directory path
    log_pattern = os.path.join(log_dir_abs, '*.json')
    print(f"Searching for logs in: {log_pattern}")
    log_files_found = glob.glob(log_pattern)
    print(f"Found {len(log_files_found)} log files.")

    for log_file in log_files_found:
        results = analyze_construction_log(log_file)
        if results:
            all_results.append(results)

    if all_results:
        df = pd.DataFrame(all_results)
        # Ensure the output directory exists (already done at top)
        # os.makedirs(os.path.dirname(output_file_abs), exist_ok=True)
        # Save to hardcoded absolute output file path
        df.to_csv(output_file_abs, index=False)
        print(f"Analysis complete. Results saved to {output_file_abs}")
    else:
        print("No results generated from log files.")

if __name__ == "__main__":
    main()