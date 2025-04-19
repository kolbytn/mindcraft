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
import filecmp
import json
import glob
import socket

from tqdm import tqdm
import boto3

# Calculate project root directory
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Define tasks directory
tasks_dir = os.path.dirname(os.path.abspath(__file__))

BLOCKED_ACTIONS_COOKING = [
    '!activate', '!attackPlayer', '!checkBlueprint', '!checkBlueprintLevel',
    '!clearChat', '!clearFurnace', '!consume', '!craftable', '!discard',
    '!endGoal', '!entities', '!equip', '!followPlayer', '!getBlueprint', '!getBlueprintLevel',
    '!goToBed', '!help', '!modes', '!moveAway', '!newAction', '!placeHere', '!putInChest',
    '!restart', '!setMode', '!stay', '!stfu', '!stop'
]
BLOCKED_ACTIONS_CRAFTING = [
    '!activate', '!attack', '!attackPlayer', '!checkBlueprint', '!checkBlueprintLevel',
    '!clearChat', '!clearFurnace', '!consume', '!craftable', '!discard', '!endConversation',
    '!endGoal', '!entities', '!followPlayer', '!getBlueprint', '!getBlueprintLevel',
    '!goToBed', '!help', '!modes', '!newAction', '!putInChest', '!restart',
    '!searchForEntity', '!setMode', '!stay', '!stfu', '!stop', '!takeFromChest',
    '!viewChest'
]
BLOCKED_ACTIONS_CONSTRUCTION = [
    '!activate', '!attackPlayer', '!clearChat', '!clearFurnace', '!collectBlocks',
    '!consume', '!craftable', '!discard', '!endConversation', '!endGoal', '!entities',
    '!equip', '!followPlayer', '!getBlueprint', '!getBlueprintLevel', '!goToBed',
    '!help', '!modes', '!moveAway', '!newAction', '!placeHere', '!putInChest',
    '!restart', '!searchForBlock', '!searchForEntity', '!setMode', '!stay', '!stfu',
    '!stop', '!takeFromChest', '!viewChest', '!craftRecipe', '!smeltItem'
]

def analyze_json_file(file_path):
    """
    Analyzes a single JSON file to extract the task outcome.

    Args:
        file_path (str): Path to the JSON file.

    Returns:
        str or None: The task outcome string if found, otherwise None.
    """
    try:
        with open(file_path, 'r') as f:
            data = json.load(f)
            if "turns" in data:
                for turn in data["turns"]:
                    if turn.get("role") == "system" and "content" in turn:
                        if isinstance(turn["content"], str) and "Task ended with score : " in turn["content"]:
                            if "Task ended with score : 1" in turn["content"]:
                                return 1
                            elif "Task ended with score : 0" in turn["content"]:
                                return 0
                            else:
                                score = float(turn["content"].split(":")[-1].strip())
                                return score
                            
                            
        return None
    except FileNotFoundError:
        print(f"Error: File not found: {file_path}")
        return None
    except json.JSONDecodeError:
        print(f"Error: Invalid JSON format in: {file_path}")
        return None
    except Exception as e:
        print(f"An unexpected error occurred while processing {file_path}: {e}")
        return None
    
def extract_result(folder_path):
    folder_name = os.path.basename(folder_path)
    json_files = glob.glob(os.path.join(folder_path, "*.json"))
    # assert len(json_files) == 2, f"Expected 2 json files in {folder_name}, found {len(json_files)}"

    if not json_files:
        return None
    else: 
        score = None
        curr_score = 0
        for json_file in json_files:
            score = analyze_json_file(json_file)
            if score is not None:
                max_score = max(score, curr_score)
                curr_score = max_score

        return curr_score
    
def aggregate_results(local_folders):
    """
    Aggregates the analysis results for each folder.

    Args:
        local_folders (list): List of local folder paths containing the JSON files.

    Returns:
        dict: A dictionary where keys are folder names and values are the aggregated outcomes.
    """
    aggregated_data = {}

    total = 0
    successful = 0
    successful_tasks = []

    task_type = local_folders[0].split("/")[-2]
    if "cooking" in task_type:
        task_type = "cooking"
    elif "techtree" in task_type:
        task_type = "techtree"
    elif "construction" in task_type:
        task_type = "construction"

    for folder_path in tqdm(local_folders):
        folder_name = os.path.basename(folder_path)

        try: 
            result = extract_result(folder_path)
            
            if result == 1:
                successful_tasks.append(folder_name)
            if result is not None:
                total += 1
                successful += result
        except Exception as e:
            print(f"Error processing {folder_name}: {e}")

    successful_tasks.sort()

    if task_type == "construction":
        successful = successful / total
    
    return {
        "total": total,
        "successful": successful,
    }

def check_folder_results(folder_path):
    """
    Evaluate all JSON files in a folder and its subfolders and calculate success metrics.
    
    Args:
        folder_path (str): Path to the folder containing JSON log files.
        
    Returns:
        dict: A dictionary with success metrics.
    """
    print(f"Checking results in folder: {folder_path}")
    
    # Check if the folder exists
    if not os.path.exists(folder_path):
        print(f"Error: Folder not found: {folder_path}")
        return None
    
    # Find all subfolders (task IDs) in the given folder
    if os.path.isdir(folder_path):
        subfolders = [f for f in glob.glob(os.path.join(folder_path, "*")) if os.path.isdir(f)]
        if subfolders:
            # If there are subfolders, evaluate each subfolder
            print(f"Found {len(subfolders)} subfolders to evaluate")
            results = aggregate_results(subfolders)
        else:
            # If no subfolders, treat the folder itself as a results folder
            print("No subfolders found, evaluating the folder itself")
            results = aggregate_results([folder_path])
            
        # Calculate success rate
        if results["total"] > 0:
            results["success_rate"] = results["successful"] / results["total"]
        else:
            results["success_rate"] = 0.0
            
        # Print summary
        print("\n=== Evaluation Results ===")
        print(f"Total tasks evaluated: {results['total']}")

        if "construction" not in folder_path:
            print(f"Successful tasks: {results['successful']}")

        if "construction" not in folder_path:
            print(f"Success rate: {results['success_rate']:.2f}")
        else:
            print(f"Success rate: {results['successful']:.2f}")
        
        return results
    else:
        print(f"Error: {folder_path} is not a directory")
        return None

def read_settings(file_path):
    """Read and parse the settings.js file to get agent profiles."""
    # Ensure file_path is absolute or relative to project_root
    if not os.path.isabs(file_path):
        file_path = os.path.join(project_root, file_path)
        
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

def update_keys_json():
    """Update the keys.json file with the specified key-value pair."""
    keys_example_path = os.path.join(project_root, "keys.example.json")
    keys_path = os.path.join(project_root, "keys.json")
    
    with open(keys_example_path, 'r', encoding='utf-8') as file:
        content = file.read()
    data = json.loads(content)

    # Update keys with environment variables
    for key in data.keys():
        env_value = os.getenv(key)  # Fetch from environment variables
        if env_value:  # If the variable exists, update it
            data[key] = env_value

    with open(keys_path, 'w', encoding='utf-8') as file:
        json.dump(data, file, indent=4)

def set_environment_variable_tmux_session(session_name, key, value):
    """Set an environment variable for the current process."""
    subprocess.run(["tmux", "send-keys", "-t", session_name, f"export {key}={value}", "C-m"])

def launch_parallel_experiments(task_path, 
                                num_exp, 
                                exp_name, 
                                num_agents=2, 
                                model="gpt-4o-mini",
                                api="openai",
                                num_parallel=1,
                                s3=False, 
                                bucket_name="mindcraft-experiments", 
                                template_profile="profiles/tasks/collab_profile.json", 
                                insecure_coding=False, 
                                url="http://127.0.0.1:8000/v1", 
                                max_messages=15,
                                num_examples=2, 
                                no_pruning=False,
                                block_conversation=False, 
                                run_in_tmux=True):
    
    # Resolve relative template_profile path
    if not os.path.isabs(template_profile):
        template_profile = os.path.join(project_root, template_profile)

    # Resolve relative task_path path
    if not os.path.isabs(task_path):
        task_path = os.path.join(project_root, task_path)

    with open(task_path, 'r', encoding='utf-8') as file:
        content = file.read()
    json_data = json.loads(content)

    task_ids = json_data.keys()

    task_type = json_data[list(task_ids)[0]]["type"]
    # split the task_ids into num_parallel groups
    task_ids = list(task_ids)
    task_ids_split = [task_ids[i::num_parallel] for i in range(num_parallel)]

    if task_type == "cooking":
        world_name = "Superflat"
    elif task_type == "techtree":
        world_name = "Forest"
    elif task_type == "construction":
        world_name = "Superflat"

    if run_in_tmux:
        servers = create_server_files("./server_data/", num_parallel, world_name=world_name)
    else:
        servers = [(f"./server_data_{i}/", 55916 + i) for i in range(num_parallel)]
    date_time = datetime.now().strftime("%m-%d_%H-%M")
    experiments_folder = f"experiments/{exp_name}_{date_time}"
    exp_name = f"{exp_name}_{date_time}"

    split_task_path = task_path.split("/")
    if len(split_task_path) > 1:
        task_path_name = split_task_path[-2]
    else:
        task_path_name = "tasks"

    s3_path = f"{bucket_name}/{task_type}/{model}/{task_path_name}/{exp_name}"

    # start wandb
    os.makedirs(experiments_folder, exist_ok=True)
    for i, server in enumerate(servers):
        launch_server_experiment(task_path, 
                                 task_ids_split[i], 
                                 num_exp, 
                                 server, 
                                 experiments_folder, 
                                 exp_name, 
                                 s3=s3, 
                                 bucket_name=bucket_name, 
                                 template_profile=template_profile, 
                                 model=model, 
                                 api=api, 
                                 insecure_coding=insecure_coding,
                                 num_agents=num_agents, 
                                 url=url, 
                                 task_type=task_type, 
                                 s3_path=s3_path, 
                                 max_messages=max_messages,
                                 num_examples=num_examples, 
                                 no_pruning=no_pruning,
                                 block_conversation=block_conversation, 
                                 run_in_tmux=run_in_tmux)
        time.sleep(5)
    
    total_num_tasks = len(task_ids)
    total_num_experiments = total_num_tasks * num_exp
    total_run = 0
    while total_run < total_num_experiments:
        results = aggregate_results([f"{experiments_folder}/{task_id}" for task_id in task_ids])
        total_run = results["total"]
        print(f"Total tasks run: {total_run}/{total_num_experiments}")
        print(results)
        results["exp_name"] = exp_name
        results["template_profile"] = template_profile
        results["model"] = model
        results["api"] = api
        results["num_agents"] = num_agents
        results["task_path"] = task_path
        results["task_type"] = task_type
        results["max_messages"] = max_messages
        results["num_examples"] = num_examples
        with open(f"{experiments_folder}/results.txt", "w") as file:
            file.write(str(results))
        if s3: 
            cmd = f"aws s3 cp {experiments_folder}/results.txt s3://{s3_path}/results.txt"
            print(cmd)
            subprocess.run(cmd.split())
        
        time.sleep(60)

def launch_server_experiment(task_path, 
                             task_ids, 
                             num_exp, 
                             server, 
                             experiments_folder,
                             exp_name="exp", 
                             num_agents=2, 
                             model="gpt-4o",
                             api="openai", 
                             s3=False, 
                             bucket_name="mindcraft-experiments", 
                             template_profile="profiles/tasks/collab_profile.json", 
                             insecure_coding=False, 
                             url="http://127.0.0.1:8000/v1", 
                             task_type="techtree", 
                             s3_path="", 
                             max_messages=15, 
                             num_examples=2, 
                             no_pruning=False,
                             block_conversation=False, 
                             run_in_tmux=True):
    
    # Resolve relative template_profile path
    if not os.path.isabs(template_profile):
        template_profile = os.path.join(project_root, template_profile)

    # Resolve relative task_path path
    if not os.path.isabs(task_path):
        task_path = os.path.join(project_root, task_path)
        
    experiments_folder = os.path.join(project_root, experiments_folder)

    server_path, server_port = server
    edit_file(os.path.join(server_path, "server.properties"), {"server-port": server_port})
    mindserver_port = server_port - 55916 + 8080
    
    # set up server and agents 
    session_name = str(server_port - 55916)
    if num_agents == 1: 
        agent_names = [f"Andy_{session_name}"]
        models = [model]
        apis = [api]
    elif num_agents == 2:
        agent_names = [f"Andy_{session_name}", f"Jill_{session_name}"]
        models = [model] * 2
        apis = [api] * 2
    else:
        # Lets use an ordered list of 10 human names.
        human_names = ["Andy", "Jill", "Bob", "Sally", "Mike", "Laura", "John", "Emma", "Tom", "Kate"]
        agent_names = []
        for i in range(num_agents):
            name = human_names[i % len(human_names)]
            agent_names.append(f"{name}_{session_name}")
        models = [model] * num_agents
        apis = [api] * num_agents
        
    make_profiles(agent_names, models, apis, template_profile=template_profile, url=url)

    agent_profiles = [f"./{agent}.json" for agent in agent_names]

    if num_agents == 1:
        agent_profiles_str = f"'[\"{agent_profiles[0]}\"]'"
    elif num_agents == 2:
        agent_profiles_str = f"'[\"{agent_profiles[0]}\", \"{agent_profiles[1]}\"]'"
    else: 
        agent_profiles_str = "'["
        for agent in agent_profiles[:-1]:
            agent_profiles_str += f'\"{agent}\", '
        agent_profiles_str += f"\"{agent_profiles[-1]}\"]'"
    print(agent_profiles_str)
    if run_in_tmux:
        print("run in tmux is true")
        launch_world(server_path, session_name="server_" + session_name, agent_names=agent_names, port=server_port)

        subprocess.run(['tmux', 'new-session', '-d', '-s', session_name], check=True) 
    # set environment variables
    if run_in_tmux:
        set_environment_variable_tmux_session(session_name, "MINECRAFT_PORT", server_port)
        set_environment_variable_tmux_session(session_name, "MINDSERVER_PORT", mindserver_port)
        set_environment_variable_tmux_session(session_name, "PROFILES", agent_profiles_str)
        set_environment_variable_tmux_session(session_name, "MAX_MESSAGES", str(max_messages))
        set_environment_variable_tmux_session(session_name, "NUM_EXAMPLES", str(num_examples))
        set_environment_variable_tmux_session(session_name, "LOG_ALL", "true")
        if insecure_coding:
            set_environment_variable_tmux_session(session_name, "INSECURE_CODING", "true")
        make_ops(agent_names, session_name)
    else: 
        agent_profiles_str = "["
        for agent in agent_profiles[:-1]:
            agent_profiles_str += f"\"{agent}\", " 
        agent_profiles_str += f"\"{agent_profiles[-1]}\"]"
        # print(agent_profiles_str)
        os.environ["PROFILES"] = agent_profiles_str
        os.environ["MAX_MESSAGES"] = str(max_messages)
        os.environ["NUM_EXAMPLES"] = str(num_examples)
        os.environ["LOG_ALL"] = "true"
    
    run_script(task_path, 
               task_ids, 
               num_exp, 
               experiments_folder, 
               agent_names, 
               server_path, 
               s3=s3, 
               s3_path=s3_path, 
               session_name=session_name, 
               run_in_tmux=run_in_tmux)

    # add the bots as op
    # op_script_content = "sleep 5\n\op @p" * 20
    # op_script_file = f"./tmp/op_script_{session_name}.sh"
    # make_script_file_and_run(op_script_content, "server_" + session_name, op_script_file)
    # blocked_actions = []
    # if not no_pruning:
    #     if task_type == "cooking":
    #         blocked_actions = BLOCKED_ACTIONS_COOKING
    #     elif task_type == "techtree":
    #         blocked_actions = BLOCKED_ACTIONS_CRAFTING
    #     elif task_type == "construction":
    #         blocked_actions = BLOCKED_ACTIONS_CONSTRUCTION
    # if block_conversation:
    #     blocked_actions += ["!endConversation", "!startConversation"]
    # set_environment_variable_tmux_session(session_name, "BLOCKED_ACTIONS", blocked_actions)

    

    # script_content = ""
    # for task_id in task_ids:
    #     # Create a separate folder for each task_id
    #     task_folder = os.path.join(experiments_folder, str(task_id))
    #     os.makedirs(task_folder, exist_ok=True)
    #     assert os.path.exists(task_folder), f"Directory {task_folder} was not created"
    #     print(f"Created directory: {task_folder}")
        
    #     cmd = f"node main.js --task_path \'{task_path}\' --task_id {task_id}"
    #     cp_cmd = f"cp {agent_names[0]}.json {server_path}bots/{agent_names[0]}/profile.json"
    #     for _ in range(num_exp):
    #         script_content += f"{cmd}\n"
    #         script_content += "sleep 2\n"
    #         for agent in agent_names:
    #             agent_file_path = os.path.join(task_folder, f"{agent}_{_}.json")
    #             script_content += f"echo 'Saving to {agent_file_path}'\n"
    #             cp_cmd = f"cp bots/{agent}/memory.json {agent_file_path}"
    #             script_content += f"echo '{cp_cmd}'\n"
    #             script_content += f"{cp_cmd}\n"
    #             script_content += "sleep 1\n"
    #             if s3:
    #                 s3_cmd = f"aws s3 cp {agent_file_path} s3://{s3_path}/{task_id}/{agent}_{_}.json"
    #                 script_content += f"echo 'Uploading {agent_file_path} to S3'\n"
    #                 script_content += f"echo '{s3_cmd}'\n"
    #                 script_content += f"{s3_cmd}\n"
    #                 script_content += "sleep 1\n"
    #     script_content += f"sleep 10\n"
    #     if s3:
    #         for agent in agent_names:
    #             script_content += f"aws s3 cp bots/{agent} s3://{s3_path}/bots/{agent} --recursive\n"

    # # Create a temporary shell script file
    # script_file = f"./tmp/experiment_script_{session_name}.sh"
    # make_script_file_and_run(script_content, script_file, session_name=session_name, run_in_tmux=True)

def run_script(task_path, 
               task_ids, 
               num_exp,
               experiments_folder, 
               agent_names,
               server_path,
               s3=False,
               s3_path="mindcraft-experiments",
               session_name="0",
               run_in_tmux=True,):
    
    # Resolve relative task_path path
    if not os.path.isabs(task_path):
        task_path = os.path.join(project_root, task_path)

    # Resolve relative experiments_folder path
    if not os.path.isabs(experiments_folder):
        experiments_folder = os.path.join(project_root, experiments_folder)

    # Resolve relative server_path path
    if not os.path.isabs(server_path):
        server_path = os.path.join(project_root, server_path)
        
    # Construct command (assuming main.js is in root)
    main_js_path = os.path.join(project_root, "main.js")
    
    for exp in range(num_exp):
        for task_id in task_ids:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            exp_folder = os.path.join(experiments_folder, f"{task_id}_{exp}_{timestamp}")
            
            # Need to create the folder first if using subprocess and cwd
            os.makedirs(exp_folder, exist_ok=True) 

            cmd = [
                "node", main_js_path,
                "--task_path", task_path,
                "--task_id", task_id,
                "--agent_name", agent_names[0],
                "--agent_name", agent_names[1],
                "--server", server_path,
                "--logs_path", exp_folder,  # Ensure logs_path is absolute or handled by main.js relative to root
            ]
            
            if s3:
                cmd.extend(["--s3", "--s3_path", s3_path])
            
            script_content = " ".join(cmd)
            make_script_file_and_run(script_content, file_name=f"exp_{exp}_{task_id}_{timestamp}.sh", session_name=session_name, run_in_tmux=run_in_tmux)
            
            print(f"Launched Experiment {exp+1}/{num_exp} for Task {task_id}")
            time.sleep(1) # Stagger launches

def make_ops(agent_names, session_name):
    """Make the agents operators in the Minecraft world."""
    print('Making agents operators...')

    # Construct path to example tasks relative to project_root
    example_task_path = os.path.join(project_root, "tasks/example_tasks.json")
    cmd = f"node {os.path.join(project_root, 'main.js')} --task_path {example_task_path} --task_id debug_{len(agent_names)}_agent_timeout"

    subprocess.run(["tmux", "send-keys", "-t", session_name, cmd, "C-m"], cwd=project_root)

    time.sleep(30)

    subprocess.run(["tmux", "send-keys", "-t", "server_" + session_name, f"/op @a", "C-m"])

    # Check ops file inside the correct tasks/server_data/X directory
    ops_file_path = os.path.join(tasks_dir, "server_data", session_name, "ops.json")
    agents_op = check_agent_ops(agent_names, ops_file=ops_file_path)
    if agents_op:
        print("Agents are operators! You are good to go :D")
    else: 
        print("Agents are not operators! Something went wrong :(")
        make_ops(agent_names, session_name)

def check_agent_ops(agent_names, ops_file="ops.json"):
    """Check if agents are OPs on the server."""
    # ops_file path is now provided absolute by caller (make_ops)
    # if not os.path.isabs(ops_file):
    #    ops_file = os.path.join(project_root, ops_file) # OLD LOGIC
        
    if not os.path.exists(ops_file):
        print(f"Error: ops.json file not found: {ops_file}")
        return False

    with open(ops_file, "r") as f:
        ops_data = json.load(f)
    
    ops_names = [op["name"] for op in ops_data]
    
    for agent in agent_names:
        if agent not in ops_names:
            return False 
    return True

def make_script_file_and_run(script_content, 
                             file_name, 
                             session_name="0",
                             run_in_tmux=True):
    # Create script inside tasks/tmp/
    script_base_dir = os.path.join(tasks_dir, "tmp")
    os.makedirs(script_base_dir, exist_ok=True)
    script_abs_path = os.path.join(script_base_dir, file_name)
    
    script_dir = os.path.dirname(script_abs_path)
    # os.makedirs(script_dir, exist_ok=True) # Already handled by script_base_dir creation
    assert os.path.exists(script_dir), f"Script directory {script_dir} was not created"
    print(f"Created script directory: {script_dir}")

    # Call the function before writing the script file
    with open(script_abs_path, 'w') as f:
        f.write(script_content)
    assert os.path.exists(script_abs_path), f"Script file {script_abs_path} was not created"

    script_file_run = "bash " + script_abs_path

    # Execute the shell script using subprocess
    # Run subprocess from project_root so node main.js etc work
    if run_in_tmux:
        subprocess.run(["tmux", "send-keys", "-t", session_name, script_file_run, "C-m"], cwd=project_root)
    else:
        subprocess.run(script_file_run.split(), cwd=project_root)

def make_profiles(agent_names, models, apis, template_profile="profiles/collab_profile.json", url="http://127.0.0.1:8000/v1"):
    """Generate profile JSON files for each agent."""
    
    # Resolve relative template_profile path relative to project_root
    if template_profile.startswith("profiles/") and not os.path.isabs(template_profile):
         template_profile = os.path.join(project_root, template_profile)
    elif not os.path.isabs(template_profile):
        # Assume relative to tasks dir if not in profiles/ structure
        template_profile = os.path.join(tasks_dir, template_profile) 

    with open(template_profile, 'r') as f:
        content = f.read()
    
    profile = json.loads(content)

    for index in range(len(agent_names)):
        profile["name"] = agent_names[index]
        if apis[index] == "vllm":
            profile["model"] = {
                "api": "vllm",
                "model": models[index], 
                "url": url
            }
        elif apis[index] == "ollama":
            profile["model"] = {
                "api": "ollama",
                "model": models[index],
                "embedding": "ollama"
            }
        else: 
            profile["model"] = models[index]

        # Save profiles inside tasks/profiles/
        profiles_output_dir = os.path.join(tasks_dir, "profiles")
        os.makedirs(profiles_output_dir, exist_ok=True)
        profile_name = f"{agent_names[index]}.json"
        profile_path = os.path.join(profiles_output_dir, profile_name) 
        
        with open(profile_path, 'w', encoding='utf-8') as outfile:
            json.dump(profile, outfile, indent=4)

def create_server_files(source_path, num_copies, world_name="Forest"):
    """Create multiple copies of the server files inside tasks/server_data."""
    servers = [] # Define servers list
    # Ensure source_path is relative to project_root if not absolute
    if not os.path.isabs(source_path):
        source_path = os.path.join(project_root, source_path)

    # Base dir inside tasks/
    server_base_dir = os.path.join(tasks_dir, "server_data") 
    os.makedirs(server_base_dir, exist_ok=True)

    for i in range(num_copies):
        # Server copies go into tasks/server_data/0/, tasks/server_data/1/, etc.
        dest_path = os.path.join(server_base_dir, str(i))
        copy_server_files(source_path, dest_path)
        print(dest_path)
        # Adjust path for edit_file
        server_prop_path = os.path.join(dest_path, "server.properties")
        edit_file(server_prop_path, {"server-port": 55916 + i, 
                                                    "level-name": world_name})
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
    """Delete server files from multiple locations within tasks/server_data."""
    server_base_dir = os.path.join(tasks_dir, "server_data")
    for i in range(num_copies):
        # Target paths like tasks/server_data/0/
        dest_path = os.path.join(server_base_dir, str(i))
        delete_server_files(dest_path)

def copy_server_files(source_path, dest_path):
    """Copy server files from source to destination (dest assumed relative to tasks_dir if not absolute)."""
    # Ensure source_path is relative to project_root if not absolute
    if not os.path.isabs(source_path):
        source_path = os.path.join(project_root, source_path)
    # Destination path is now expected inside tasks/server_data/, handled by caller (create_server_files)
    # if not os.path.isabs(dest_path):
    #     dest_path = os.path.join(project_root, dest_path) # OLD LOGIC
        
    if os.path.exists(dest_path):
        shutil.rmtree(dest_path)
    try:
        shutil.copytree(source_path, dest_path)
        print(f"Server files copied to {dest_path}")
    except Exception as e:
        print(f"Error copying server files: {e}")
    time.sleep(10)

    same_files = check_same_files(source_path, dest_path)
    if not same_files:
        copy_server_files(source_path, dest_path)
        print("The destination path does not contain all the same files as the source path.")
    else:
        print("The destination path contains all the same files as the source path.")

def check_same_files(d1, d2):

    items1 = set(os.listdir(d1))
    items2 = set(os.listdir(d2))

    if items1 != items2:
        return False
    return True

def delete_server_files(dest_path):
    """Delete server files at the destination path (assumed relative to tasks_dir if not absolute)."""
    # Path is now expected inside tasks/server_data/, handled by callers
    # if not os.path.isabs(dest_path):
    #    dest_path = os.path.join(project_root, dest_path) # OLD LOGIC
        
    if os.path.exists(dest_path):
        shutil.rmtree(dest_path)
    if not os.path.exists(dest_path):
        print("Server files deleted successfully.")
    # else:
    #     print("Error deleting server files.")
    #     delete_server_files(dest_path)
    

def launch_world(server_path="./server_data/", agent_names=["andy", "jill"], session_name="server", port=55916):
    """Launch the Minecraft server world (server assumed inside tasks/server_data)."""
    # Ensure path is relative to tasks_dir if not absolute (expecting tasks/server_data/X)
    if not os.path.isabs(server_path):
        server_path = os.path.join(tasks_dir, server_path)
        
    ops_file = os.path.join(server_path, "ops.json") # ops.json inside specific server dir
    check_agent_ops(agent_names, ops_file=ops_file)

    # Launch server using tmux (cwd should be the server_path itself)
    java_cmd = f"java -jar server.jar nogui"
    # Create tmux session for the server
    subprocess.run(['tmux', 'new-session', '-d', '-s', session_name], check=True)
    # Send command to the server session, running from its directory
    subprocess.run(["tmux", "send-keys", "-t", session_name, java_cmd, "C-m"], cwd=server_path)
    print(f"Launched Minecraft world in session {session_name} from {server_path} on port {port}...")
    # Add a delay and check if server started
    time.sleep(20) # Increased delay
    if not test_server_running(port):
        print(f"Warning: Server on port {port} didn't seem to start correctly after launch.")

def test_server_running(port=55916):
    host = 'localhost'

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.connect((host, port))
            print("Server is running on port 55916")
            return True
        except ConnectionRefusedError:
            print("Server is not running on port 55916")
            return False

def kill_world(session_name="server"):
    """Kill the Minecraft world."""
    subprocess.run(["tmux", "send-keys", "-t", session_name, "stop", "C-m"])
    time.sleep(5)
    subprocess.run(["tmux", "kill-session", "-t", session_name])

def detach_process(command):
    """Detach a process using tmux."""
    # Assume commands are run from project root if needed elsewhere
    process = subprocess.Popen(command, shell=True, preexec_fn=os.setsid) # Example, might need cwd

def main():
    parser = argparse.ArgumentParser(description="Evaluate MindCraft tasks")
    parser.add_argument("--task_path", type=str, default="tasks/example_tasks.json", help="Path to the task file or directory (relative to project root)")
    parser.add_argument("--task_ids", type=str, nargs="+", default=None, help="Specific task IDs to run")
    parser.add_argument("--num_exp", type=int, default=1, help="Number of experiments per task")
    parser.add_argument("--num_agents", type=int, default=2, help="Number of agents")
    parser.add_argument("--model", type=str, default="gpt-4o-mini", help="Model name")
    parser.add_argument("--api", type=str, default="openai", help="API provider")
    parser.add_argument("--num_parallel", type=int, default=1, help="Number of parallel experiments")
    parser.add_argument("--s3", action="store_true", help="Use S3 for storage")
    parser.add_argument("--bucket_name", type=str, default="mindcraft-experiments", help="S3 bucket name")
    parser.add_argument("--template_profile", type=str, default="profiles/tasks/collab_profile.json", help="Template profile path")
    parser.add_argument("--insecure_coding", action="store_true", help="Allow insecure coding practices")
    parser.add_argument("--url", type=str, default="http://127.0.0.1:8000/v1", help="API URL")
    parser.add_argument("--check_results", action="store_true", help="Only check results in the specified folder")
    parser.add_argument("--servers", type=str, nargs="+", default=["local"], help="List of server directories (e.g., 0 1 2 for server_data/0, server_data/1, etc.) or 'local' for parallel local runs")
    parser.add_argument("--exp_name", type=str, default="exp", help="Experiment name prefix")
    parser.add_argument("--s3_path", type=str, default="", help="S3 path prefix")
    parser.add_argument("--max_messages", type=int, default=15, help="Maximum messages per agent")
    parser.add_argument("--num_examples", type=int, default=2, help="Number of examples for few-shot learning")
    parser.add_argument("--no_pruning", action="store_true", help="Disable pruning")
    parser.add_argument("--block_conversation", action="store_true", help="Block agent conversation actions")
    parser.add_argument("--run_in_tmux", action="store_false", help="Run experiment directly without tmux") # Default is True

    args = parser.parse_args()

    # Resolve relative paths provided as arguments or defaults (relative to project root)
    if not os.path.isabs(args.task_path):
        args.task_path = os.path.join(project_root, args.task_path)
    if not os.path.isabs(args.template_profile):
         # Special handling for default profile path relative to project root
        if args.template_profile.startswith("profiles/"):
            args.template_profile = os.path.join(project_root, args.template_profile)
        else: # Assume relative to tasks dir otherwise
             args.template_profile = os.path.join(tasks_dir, args.template_profile)

    if args.check_results:
        # Hardcode check_folder_results to read from project_root/experiments
        check_dir = os.path.join(project_root, "experiments")
        check_folder_results(check_dir)
        return
    
    # Default server source path relative to project_root
    default_server_source = os.path.join(project_root, "server_data")
    if not args.run_in_tmux: # Assuming this corresponds to needing server files
        # Pass default_server_source to create_server_files
        servers = create_server_files(default_server_source, args.num_parallel, world_name="Forest") # Example world name
        # The rest of the logic might need adjustment if not using tmux
    else:
        # Logic for when run_in_tmux is True (perhaps no server creation needed here?)
        # Or maybe create_server_files should always run? Adjusting based on original logic
        # Let's assume server files are always needed for parallel runs
         servers = create_server_files(default_server_source, args.num_parallel, world_name="Forest") # Example world name
    
    # delete all server files (now inside tasks/server_data)
    # The clean_up_server_files function now uses the correct base path
    clean_up_server_files(args.num_parallel)
    
    if hasattr(args, 'add_keys') and args.add_keys: # Check if arg exists before using
        update_keys_json()
    
    launch_parallel_experiments(args.task_path, 
                                num_exp=args.num_exp, 
                                exp_name=args.exp_name, 
                                num_parallel=args.num_parallel, 
                                s3=args.s3, 
                                bucket_name=args.bucket_name, 
                                template_profile=args.template_profile, 
                                model=args.model, 
                                api=args.api, 
                                insecure_coding=args.insecure_coding,
                                num_agents=args.num_agents, 
                                url=args.url, 
                                max_messages=args.max_messages,
                                num_examples=args.num_examples, 
                                no_pruning=args.no_pruning, 
                                block_conversation=args.block_conversation,
                                run_in_tmux=not args.run_in_tmux)

if __name__ == "__main__":
    main()