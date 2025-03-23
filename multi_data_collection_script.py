import os
import shutil
import subprocess
import argparse
from pathlib import Path
from datetime import datetime
import time
import json
import tqdm
from analyse_results import extract_result, get_immediate_subdirectories, analyze_json_file
import glob


"""
This script is intended to run the evaluation script multiple times and then automatically aggregate the 
successful logs into a subfolder for each run, based on the success marked in the experiment folder. Then 
at the end it will aggregate everything into a json file, ready for training. 

Example usage: 
python3 ./multi_data_collection_script.py --api vllm --model meta-llama/Meta-Llama-3-8B-Instruct --num_agents 2 --num_parallel 2 \
    --tasks "tasks/crafting_tasks/test_tasks/tasks_2_agents.json:3" "tasks/crafting_tasks/test_tasks/tasks_3_agents.json:3"

Meaning run those two tasks each 2 times, with num agents. The results will be in 
./full_run_logs_{date}
and ./successful_run_logs_{date}
Use the successful run logs to train the next model.

"""


def extract_result_single_agent(folder_path):
    folder_name = os.path.basename(folder_path)
    json_files = glob.glob(os.path.join(folder_path, "*.json"))
    if not json_files:
        print(f"No JSON files found in {folder_name}")
        return None
    else:
        outcome = False
        for json_file in json_files:
            outcome = analyze_json_file(json_file)
            if outcome:
                return True
        return False


def identify_success_folders(download_dir, num_agents):
    folders = get_immediate_subdirectories(download_dir)
    
    if num_agents == 1:
        extract_result_fn = extract_result_single_agent
    else:
        extract_result_fn = extract_result
    
    total = 0
    successful = 0
    successful_exp_list = []
    
    for folder_path in tqdm.tqdm(folders):
        folder_name = os.path.basename(folder_path)

        try: 
            total += 1
            success = int(extract_result_fn(folder_path))
            successful += success
            if success:
                successful_exp_list.append(folder_path)
        except Exception as e:
            print(f"Error processing {folder_name}: {e}")
    
    return successful_exp_list


def run_data_collection(args):
    # Set up directories
    LOGS_DIR = Path("logs")
    SUCCESSFUL_DIR = Path(f"successful_run_logs_{datetime.now().strftime('%Y-%m-%d')}")
    FULL_RUN_LOGS_DIR = Path(f"full_run_logs_{datetime.now().strftime('%Y-%m-%d')}")
    EXPERIMENTS_DIR = Path("experiments")
    BOTS_DIR = Path("bots")
    LOGS_DIR.mkdir(exist_ok=True)
    SUCCESSFUL_DIR.mkdir(exist_ok=True)
    FULL_RUN_LOGS_DIR.mkdir(exist_ok=True)

    # Parse tasks and repetitions
    TASKS_TO_RUN = []
    for task_spec in args.tasks:
        parts = task_spec.split(':')
        if len(parts) == 2:
            task_path, repeats = parts[0], int(parts[1])
            TASKS_TO_RUN.append((task_path, repeats))
        else:
            print(f"Warning: Invalid task specification '{task_spec}', expected format 'path:repeats'")
            
    # First clear anything named Andy_ or Jill_ from the bots/ folder
    for bot_dir in BOTS_DIR.glob("*"):
        if bot_dir.name.startswith(("Andy_", "Jill_", "agent_")):
            shutil.rmtree(bot_dir)

    run_counter = 1
    for task_path, repeats in TASKS_TO_RUN:
        for rep in range(repeats):
            run_id = f"run_{run_counter:03d}"
            print(f"\n Starting {task_path} (rep {rep + 1}/{repeats}) -> {run_id}")

            # Track start time to locate experiment folder
            before = set(EXPERIMENTS_DIR.glob("*"))

            # Run evaluation
            subprocess.run([
                "python", args.eval_script,
                "--api", args.api,
                "--model", args.model,
                "--task_path", task_path,
                "--num_agents", str(args.num_agents),
                "--num_parallel", str(args.num_parallel)
            ], check=True)

            # Wait for experiment folder to appear
            time.sleep(20)  # avoid race condition
            after = set(EXPERIMENTS_DIR.glob("*"))
            new_experiments = list(after - before)
            assert len(new_experiments) == 1, f"Expected one new experiment folder, found {len(new_experiments)}"
            experiment_dir = new_experiments[0]

            print(f"Found experiment folder: {experiment_dir}")
            
            # Identify successful experiments
            successful_exp_list = identify_success_folders(experiment_dir, args.num_agents)
            
            # Save successful logs and results
            success_output_dir = SUCCESSFUL_DIR / run_id
            success_output_dir.mkdir(parents=True, exist_ok=True)
            # Identify the ones that are successful
            for exp_path in successful_exp_list:
                exp_name = os.path.basename(exp_path)
                # For each agent, find and copy their logs for this successful experiment
                for bot_dir in BOTS_DIR.glob("*"):
                    if bot_dir.name.startswith(("Andy_", "Jill_", "agent_")):
                        agent_logs_dir = bot_dir / "logs"
                        if agent_logs_dir.exists():
                            # Look for the experiment directory directly under logs
                            exp_dir = agent_logs_dir / exp_name
                            if exp_dir.exists():
                                # Add timestamp for uniqueness
                                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
                                dest_dir = success_output_dir / f"{bot_dir.name}_{timestamp}_{exp_name}"
                                shutil.copytree(exp_dir, dest_dir)
                                print(f"Copied successful log directory: {exp_dir} -> {dest_dir}")
            
            # Move full logs to the full logs dir, aka anything named Jill_ or Andy_
            full_logs_dir = FULL_RUN_LOGS_DIR / run_id
            full_logs_dir.mkdir(parents=True, exist_ok=True)
            for bot_dir in BOTS_DIR.glob("*"):
                if bot_dir.name.startswith(("Andy_", "Jill_", "agent_")):
                    # bot_dir is already the full path, no need for agent_dir
                    dest_dir = full_logs_dir / bot_dir.name
                    if bot_dir.exists():
                        shutil.copytree(bot_dir, dest_dir, dirs_exist_ok=True)
                        print(f"Copied full agent directory for {bot_dir.name} to {dest_dir}")

            run_counter += 1

    print("\nAll evaluations done and successful runs saved.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run multiple evaluations and collect successful logs")
    parser.add_argument("--eval_script", default="evaluation_script.py", help="Path to evaluation script")
    parser.add_argument("--api", default="vllm", help="API to use")
    parser.add_argument("--model", default="meta-llama/Meta-Llama-3-8B-Instruct", help="Model to use")
    parser.add_argument("--num_agents", type=int, default=2, help="Number of agents")
    parser.add_argument("--num_parallel", type=int, default=2, help="Number of parallel runs")
    parser.add_argument("--tasks", nargs="+", default=["tasks/crafting_tasks/test_tasks/tasks_2_agents.json:2"], 
                        help="Tasks to run in format 'path:repeats'")
    
    args = parser.parse_args()
    run_data_collection(args)
