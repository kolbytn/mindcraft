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


def set_environment_variable_tmux_session(session_name, key, value):
    """Set an environment variable for the current process."""
    subprocess.run(["tmux", "send-keys", "-t", session_name, f"export {key}={value}", "C-m"])

def launch_parallel_experiments(task_path, 
                                num_exp, 
                                exp_name, 
                                num_agents=2, 
                                model="gpt-4o", 
                                num_parallel=1):
    
    with open(task_path, 'r', encoding='utf-8') as file:
        content = file.read()
    json_data = json.loads(content)

    task_ids = json_data.keys()

    # split the task_ids into num_parallel groups
    task_ids = list(task_ids)
    task_ids_split = [task_ids[i::num_parallel] for i in range(num_parallel)]

    servers = create_server_files("../server_data/", num_parallel)
    date_time = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    experiments_folder = f"experiments/{exp_name}_{date_time}"
    exp_name = f"{exp_name}_{date_time}"

    # start wandb
    os.makedirs(experiments_folder, exist_ok=True)
    for i, server in enumerate(servers):
        launch_server_experiment(task_path, task_ids_split[i], num_exp, server, experiments_folder, exp_name)
        time.sleep(5)


def launch_server_experiment(task_path, 
                             task_ids, 
                             num_exp, 
                             server, 
                             experiments_folder,
                             exp_name="exp", 
                             num_agents=2, 
                             model="gpt-4o"):
    """
    Launch a Minecraft server and run experiments on it.
    @param task_path: Path to the task file
    @param task_ids: IDs of the tasks to run
    @param num_exp: Number of experiments to run
    @param server: Tuple containing server path and port
    @param experiments_folder: Folder to store experiment results
    @param exp_name: Name of the experiment for wandb dataset
    @param num_agents: Number of agents to run
    @param model: Model to use for the agents
    """
    server_path, server_port = server
    edit_file(os.path.join(server_path, "server.properties"), {"server-port": server_port})
    mindserver_port = server_port - 55916 + 8080
    
    # set up server and agents 
    session_name = str(server_port - 55916)
    if num_agents == 2:
        agent_names = [f"andy_{session_name}", f"jill_{session_name}"]
        models = [model] * 2
    else:
        agent_names = [f"andy_{session_name}", f"jill_{session_name}", f"bob_{session_name}"]
        models = [model] * 3
    make_profiles(agent_names, models)

    # edit_file("settings.js", {"profiles": [f"./{agent}.json" for agent in agent_names]})
    agent_profiles = [f"./{agent}.json" for agent in agent_names]
    agent_profiles_str = f"\'[\"{agent_profiles[0]}\", \"{agent_profiles[1]}\"]\'"
    print(agent_profiles_str)
    launch_world(server_path, session_name="server_" + session_name, agent_names=agent_names)

    subprocess.run(['tmux', 'new-session', '-d', '-s', session_name], check=True) 

    # set environment variables
    set_environment_variable_tmux_session(session_name, "MINECRAFT_PORT", server_port)
    set_environment_variable_tmux_session(session_name, "MINDSERVER_PORT", mindserver_port)
    set_environment_variable_tmux_session(session_name, "PROFILES", agent_profiles_str)

    script_content = ""
    for task_id in task_ids:
        cmd = f"node main.js --task_path {task_path} --task_id {task_id}"
        cp_cmd = f"cp {agent_names[0]}.json {server_path}bots/{agent_names[0]}/profile.json"
        for _ in range(num_exp):
            script_content += f"{cmd}\n"
            script_content += "sleep 2\n"
            for agent in agent_names:
                cp_cmd = f"cp bots/{agent}/memory.json {experiments_folder}/{task_id}_{agent}_{_}.json"
                script_content += f"{cp_cmd}\n"
                script_content += "sleep 1\n"
                script_content += f"echo 'Uploading {experiments_folder}/{task_id}_{agent}_{_}.json to wandb'\n"
                wandb_cmd = f"wandb artifact put {experiments_folder}/{task_id}_{agent}_{_}.json --name {exp_name}_{task_id}_{agent}_{_} --type dataset"
                script_content += f"echo '{wandb_cmd}'\n"
                script_content += f"{wandb_cmd}\n"
                script_content += "sleep 1\n"
            script_content += "sleep 1\n"

    # Create a temporary shell script file
    script_file = f"./tmp/experiment_script_{session_name}.sh"

    script_dir = os.path.dirname(script_file)
    os.makedirs(script_dir, exist_ok=True)

    # Call the function before writing the script file
    with open(script_file, 'w') as f:
        f.write(script_content)

    script_file_run = "bash " + script_file

    # Execute the shell script using subprocess
    subprocess.run(["tmux", "send-keys", "-t", session_name, script_file_run, "C-m"])


    # subprocess.run(["tmux", "send-keys", "-t", session_name, f"/op {agent_names[0]}", "C-m"])

def make_profiles(agent_names, models):
    assert len(agent_names) == len(models)
    for index in range(len(agent_names)):
        content = {"name": agent_names[index], "model": models[index], "modes": {"hunting": False}}
        with open(f"{agent_names[index]}.json", 'w') as f:
            json.dump(content, f)

def create_server_files(source_path, num_copies):
    """Create multiple copies of server files for parallel experiments."""
    print("Creating server files...")
    print(num_copies)
    servers = []
    for i in range(num_copies):
        dest_path = f"../server_data_{i}/"
        copy_server_files(source_path, dest_path)
        print(dest_path)
        edit_file(dest_path + "server.properties", {"server-port": 55916 + i})
        # edit_server_properties_file(dest_path, 55916 + i)
        servers.append((dest_path, 55916 + i))
    return servers

def edit_file(file, content_dict):
    try:
        with open(file, 'r') as f:
            lines = f.readlines()
        with open(file, 'w') as f:
            for line in lines:
                for key, value in content_dict.items():
                    if line.startswith(key):
                        f.write(f"{key}={value}\n")
                    else:
                        f.write(line)
        print(f"{file} updated with {content_dict}")  
    except Exception as e:
        print(f"Error editing file {file}: {e}")

def clean_up_server_files(num_copies):
    """Delete server files from multiple locations."""
    for i in range(num_copies):
        dest_path = f"../server_data_{i}/"
        delete_server_files(dest_path)

def copy_server_files(source_path, dest_path):
    """Copy server files to the specified location."""
    try:
        shutil.copytree(source_path, dest_path)
        print(f"Server files copied to {dest_path}")
    except Exception as e:
        print(f"Error copying server files: {e}")

def delete_server_files(dest_path):
    """Delete server files from the specified location."""
    try:
        shutil.rmtree(dest_path)
        print(f"Server files deleted from {dest_path}")
    except Exception as e:
        print(f"Error deleting server files: {e}")

def launch_world(server_path="../server_data/", agent_names=["andy", "jill"], session_name="server"):
    """Launch the Minecraft world."""
    print(server_path)
    cmd = f"cd {server_path} && java -jar server.jar"
    subprocess.run(['tmux', 'new-session', '-d', '-s', session_name], check=True)
    subprocess.run(["tmux", "send-keys", "-t", session_name, cmd, "C-m"])
    for agent in agent_names:
        subprocess.run(["tmux", "send-keys", "-t", session_name, f"/op {agent}", "C-m"]) 
    time.sleep(5)

def kill_world(session_name="server"):
    """Kill the Minecraft world."""
    subprocess.run(["tmux", "send-keys", "-t", session_name, "stop", "C-m"])
    time.sleep(5)
    subprocess.run(["tmux", "kill-session", "-t", session_name])

def detach_process(command):
    """
    Launches a subprocess and detaches from it, allowing it to run independently.

    Args:
        command: A list of strings representing the command to execute, e.g., ['python', 'my_script.py'].
    """

    try:
        # Create a new process group so the child doesn't get signals intended for the parent.
        #  This is crucial for proper detachment.
        kwargs = {}
        if sys.platform == 'win32':
            kwargs.update(creationflags=subprocess.CREATE_NEW_PROCESS_GROUP)  # Windows specific

        process = subprocess.Popen(command, 
                                   stdin=subprocess.PIPE, # Prevent stdin blocking
                                   stdout=subprocess.PIPE, # Redirect stdout
                                   stderr=subprocess.PIPE, # Redirect stderr
                                   close_fds=True,  # Close open file descriptors
                                   **kwargs)

        print(f"Process launched with PID: {process.pid}")
        return process.pid  # Return the PID of the detached process

    except FileNotFoundError:
        print(f"Error: Command not found: {command}")
        return None
    except Exception as e:
        print(f"An error occurred: {e}")
        return None

def main():
    # edit_settings("settings.js", {"profiles": ["./andy.json", "./jill.json"], "port": 55917})
    # edit_server_properties_file("../server_data/", 55917)

    parser = argparse.ArgumentParser(description='Run Minecraft AI agent experiments')
    parser.add_argument('--task_path', default="multiagent_crafting_tasks.json", help='Path to the task file')
    parser.add_argument('--task_id', default=None, help='ID of the task to run')
    parser.add_argument('--num_exp', default=1, type=int, help='Number of experiments to run')
    parser.add_argument('--num_parallel', default=1, type=int, help='Number of parallel servers to run')
    parser.add_argument('--exp_name', default="exp", help='Name of the experiment')
    parser.add_argument('--wandb', action='store_true', help='Whether to use wandb')
    parser.add_argument('--wandb-project', default="minecraft_experiments", help='wandb project name')

    args = parser.parse_args()

    if args.wandb:
        import wandb
        wandb.init(project=args.wandb_project, name=args.exp_name)

    # kill all tmux session before starting
    try: 
        subprocess.run(['tmux', 'kill-server'], check=True)
    except: 
        print("No tmux session to kill")
    
    # delete all server files
    clean_up_server_files(args.num_parallel)
    if args.task_id is None:
        launch_parallel_experiments(args.task_path, num_exp=args.num_exp, exp_name=args.exp_name, num_parallel=args.num_parallel)
    
    # servers = create_server_files("../server_data/", args.num_parallel)
    # date_time = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    # experiments_folder = f"{args.exp_name}_{date_time}"
    # os.makedirs(experiments_folder, exist_ok=True)
    # for server in servers:
    #     launch_server_experiment(args.task_path, [args.task_id], args.num_exp, server, experiments_folder)
    #     time.sleep(5)
    
    # run_experiment(args.task_path, args.task_id, args.num_exp)

if __name__ == "__main__":
    main()