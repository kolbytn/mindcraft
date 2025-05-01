# run all tasks in a given file

import os
import json
import argparse
import subprocess
import time

def run_task(task_path, task_id, profiles=None):
    """Run a single task using main.js"""
    # Convert task_path to absolute path if it's relative
    if not os.path.isabs(task_path):
        task_path = os.path.abspath(task_path)
    
    cmd = ["node", "main.js", "--task_path", task_path, "--task_id", task_id]
    
    # Add profiles if provided
    if profiles:
        cmd.extend(["--profiles", *profiles])
    
    print(f"Running task: {task_id}")
    
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    # Execute the command from the project root directory
    process = subprocess.run(cmd, check=True, cwd=project_root)
    
    return process.returncode == 0

def main():
    parser = argparse.ArgumentParser(description='Run all tasks in a JSON file sequentially')
    parser.add_argument('--task_path', required=True, help='Path to the task file')
    parser.add_argument('--profiles', nargs='+', help='List of agent profile paths')
    parser.add_argument('--delay', type=int, default=2, help='Delay in seconds between tasks')
    
    args = parser.parse_args()
    
    # Load the task file
    with open(args.task_path, 'r') as f:
        tasks = json.load(f)
    
    print(f"Found {len(tasks)} tasks in {args.task_path}")
    
    # Run each task sequentially
    successful_tasks = 0
    for task_id in tasks:
        success = run_task(args.task_path, task_id, args.profiles)
        if success:
            successful_tasks += 1
            
        # Wait between tasks
        time.sleep(args.delay)
    
    print(f"Completed {successful_tasks}/{len(tasks)} tasks successfully")

if __name__ == "__main__":
    main()

