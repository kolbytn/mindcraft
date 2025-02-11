import argparse
import json
import subprocess
import time
from datetime import datetime
import re

def read_settings(file_path):
    """Read and parse the settings.js file to get agent profiles."""
    with open(file_path, 'r', encoding='utf-8') as file:
        content = file.read()

    # Remove `export default` and trailing commas
    content = re.sub(r'export\s+default', '', content)
    content = re.sub(r',\s*(?=[}\]])', '', content)

    # Remove JavaScript comments
    content = re.sub(r'//.*', '', content)

    # Remove trailing commas (e.g., before } or ])
    content = re.sub(r',\s*(?=[}\]])', '', content)

    # Strip leading and trailing whitespace
    content = content.strip()

    json_data = json.loads(content)

    profiles = json_data['profiles']

    ## profiles is a list of strings like "./andy.json" and "./bob.json"

    agent_names = [profile.split('/')[-1].split('.')[0] for profile in profiles]
    return agent_names

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

def run_experiment(task_path, task_id, num_exp):
    """Run the specified number of experiments and track results."""
    # Read agent profiles from settings.js
    agents = read_settings(file_path="settings.js")
    print(f"Detected agents: {agents}")
    
    # Generate timestamp at the start of experiments
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    results_filename = f"results_{task_id}_{timestamp}.txt"
    print(f"Results will be saved to: {results_filename}")
    
    success_count = 0
    experiment_results = []
    
    for exp_num in range(num_exp):
        print(f"\nRunning experiment {exp_num + 1}/{num_exp}")
        
        start_time = time.time()
        
        # Run the node command
        cmd = f"node main.js --task_path {task_path} --task_id {task_id}"
        try:
            subprocess.run(cmd, shell=True, check=True)
        except subprocess.CalledProcessError as e:
            print(f"Error running experiment: {e}")
            continue
            
        # Check if task was successful
        success = check_task_completion(agents)
        if success:
            success_count += 1
            print(f"Experiment {exp_num + 1} successful")
        else:
            print(f"Experiment {exp_num + 1} failed")
        
        end_time = time.time()
        time_taken = end_time - start_time
        
        # Store individual experiment result
        experiment_results.append({
            'success': success,
            'time_taken': time_taken
        })
        
        # Update results file after each experiment using the constant filename
        update_results_file(task_id, success_count, exp_num + 1, time_taken, experiment_results, results_filename)
        
        # Small delay between experiments
        time.sleep(1)
    
    final_ratio = success_count / num_exp
    print(f"\nExperiments completed. Final success ratio: {final_ratio:.2f}")

def main():
    parser = argparse.ArgumentParser(description='Run Minecraft AI agent experiments')
    parser.add_argument('task_path', help='Path to the task file')
    parser.add_argument('task_id', help='ID of the task to run')
    parser.add_argument('num_exp', type=int, help='Number of experiments to run')
    
    args = parser.parse_args()
    
    run_experiment(args.task_path, args.task_id, args.num_exp)

if __name__ == "__main__":
    main()