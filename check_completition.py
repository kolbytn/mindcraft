import argparse
import json
import shutil
import subprocess
import time
from datetime import datetime
import re
import sys
import os
import time


def check_task_completion(agents):
    """Check memory.json files of all agents to determine task success/failure."""
    for agent in agents:
        memory_path = f"bots/{agent}/memory.json"
        try:
            with open(memory_path, 'r') as f:
                memory = json.load(f)
                
            # Check the last system message in turns
            for turn in reversed(memory['turns']):
                if turn['role'] == 'system' and 'code' in turn['content']:
                    # Extract completion code
                    if 'code : 2' in turn['content']:
                        return True  # Task successful
                    elif 'code : 4' in turn['content']:
                        return False  # Task failed
            
        except (FileNotFoundError, json.JSONDecodeError) as e:
            print(f"Error reading memory for agent {agent}: {e}")
            continue
            
    return False  # Default to failure if no conclusive result found

def update_results_file(task_id, success_count, total_count, time_taken, experiment_results, results_filename):
    """Update the results file with current success ratio and time taken."""
    success_ratio = success_count / total_count
    
    with open(results_filename, 'w') as f:  # 'w' mode overwrites the file each time
        f.write(f"Task ID: {task_id}\n")
        f.write(f"Experiments completed: {total_count}\n")
        f.write(f"Successful experiments: {success_count}\n")
        f.write(f"Success ratio: {success_ratio:.2f}\n")
        f.write(f"Time taken for last experiment: {time_taken:.2f} seconds\n")
        
        # Write individual experiment results
        for i, result in enumerate(experiment_results, 1):
            f.write(f"Experiment {i}: {'Success' if result['success'] else 'Failure'}, Time taken: {result['time_taken']:.2f} seconds\n")
        
        # Write aggregated metrics
        total_time = sum(result['time_taken'] for result in experiment_results)
        f.write(f"\nAggregated metrics:\n")
        f.write(f"Total experiments: {total_count}\n")
        f.write(f"Total successful experiments: {success_count}\n")
        f.write(f"Overall success ratio: {success_ratio:.2f}\n")
        f.write(f"Total time taken: {total_time:.2f} seconds\n")
        f.write(f"Average time per experiment: {total_time / total_count:.2f} seconds\n")
        f.write(f"Last updated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")