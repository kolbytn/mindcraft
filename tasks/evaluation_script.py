import argparse
import json
import shutil
import subprocess
import time
from datetime import datetime
import re
import sys
import os
import logging
import pandas as pd

# Set up basic logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

from tasks.evaluation import (
    extract_task_outcome,
    aggregate_results_to_dataframe,
)

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


from typing import List, Dict, Any, Tuple

def aggregate_results(local_folders: List[str], task_definitions: Dict[str, Any]) -> pd.DataFrame:
    """
    Aggregates experiment results from local folders into a DataFrame.

    This function iterates through a list of folders, each representing a single
    task run. It uses the `extract_task_outcome` function to analyze the agent
    logs within each folder and compiles the results into a structured DataFrame.

    Args:
        local_folders (List[str]): A list of paths to the task run folders.
        task_definitions (Dict[str, Any]): A dictionary of all task definitions,
                                           keyed by task_id.

    Returns:
        pd.DataFrame: A DataFrame containing the detailed evaluation results.
    """
    task_outcomes = []
    for folder_path in local_folders:
        # Extract the task_id from the folder name. This assumes the folder is named after the task_id.
        task_id = os.path.basename(folder_path.strip(os.sep))
        task_def = task_definitions.get(task_id)

        if not task_def:
            logging.warning(f"No task definition found for task_id '{task_id}'. Skipping folder '{folder_path}'.")
            continue
        
        # The task definition from the file might not have the task_id in it, so we add it.
        if 'task_id' not in task_def:
            task_def['task_id'] = task_id

        try:
            outcome = extract_task_outcome(folder_path, task_def)
            task_outcomes.append(outcome)
        except Exception as e:
            logging.error(f"Error processing folder {folder_path}: {e}")

    return aggregate_results_to_dataframe(task_outcomes)


def check_folder_results(folder_path: str, task_file_path: str) -> pd.DataFrame:
    """
    Evaluates all subfolders in a given directory and prints a summary.

    This function serves as a high-level entry point for analyzing an experiment
    folder. It finds all immediate subdirectories, loads task definitions,
    aggregates results, and prints a summary of success rates and completion
    statuses.

    Args:
        folder_path (str): The path to the main experiment folder containing subfolders
                           for each task run.
        task_file_path (str): The path to the JSON file containing task definitions.

    Returns:
        pd.DataFrame: A DataFrame with the full evaluation results, or None if a
                      critical error occurs.
    """
    logging.info(f"Checking results in folder: {folder_path}")
    
    if not os.path.exists(folder_path) or not os.path.isdir(folder_path):
        logging.error(f"Folder not found or is not a directory: {folder_path}")
        return None

    try:
        with open(task_file_path, 'r') as f:
            task_definitions = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        logging.error(f"Error reading or parsing task definition file {task_file_path}: {e}")
        return None

    subfolders = [f.path for f in os.scandir(folder_path) if f.is_dir()]
    if not subfolders:
        logging.warning("No subfolders found to evaluate.")
        return pd.DataFrame()

    logging.info(f"Found {len(subfolders)} subfolders to evaluate.")
    results_df = aggregate_results(subfolders, task_definitions)

    if results_df.empty:
        logging.warning("No results were generated.")
        return results_df

    # Calculate and print summary statistics from the DataFrame
    total_tasks = len(results_df)
    successful_tasks = results_df['overall_is_successful'].sum()
    success_rate = (successful_tasks / total_tasks) if total_tasks > 0 else 0.0
    
    logging.info("\n=== Evaluation Results Summary ===")
    logging.info(f"Total tasks evaluated: {total_tasks}")
    logging.info(f"Successful tasks: {successful_tasks}")
    logging.info(f"Overall Success Rate: {success_rate:.2%}")

    # You can add more detailed analysis here, e.g., by task type
    if 'task_type' in results_df.columns:
        logging.info("\n--- Success Rate by Task Type ---")
        type_success = results_df.groupby('task_type')['overall_is_successful'].mean().map("{:.2%}".format)
        logging.info(type_success)

    if 'overall_completion_status' in results_df.columns:
        logging.info("\n--- Completion Status Distribution ---")
        status_dist = results_df['overall_completion_status'].value_counts(normalize=True).map("{:.2%}".format)
        logging.info(status_dist)
        
    return results_df

def read_settings(file_path: str) -> List[str]:
    """
    Reads and parses a settings.js file to extract agent profile names.

    This function is designed to handle the JavaScript export format by stripping
    comments, trailing commas, and the 'export default' statement before parsing
    it as JSON.

    Args:
        file_path (str): The path to the settings.js file.

    Returns:
        List[str]: A list of agent names extracted from the profiles.
    """
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

def update_keys_json() -> None:
    """
    Updates the keys.json file with values from environment variables.

    This function reads `keys.example.json`, iterates through its keys, and
    replaces the values with corresponding environment variables if they exist.
    The result is written to `keys.json`.
    """
    with open("keys.example.json", 'r', encoding='utf-8') as file:
        content = file.read()
    data = json.loads(content)

    # Update keys with environment variables
    for key in data.keys():
        env_value = os.getenv(key)  # Fetch from environment variables
        if env_value:  # If the variable exists, update it
            data[key] = env_value

    with open("keys.json", 'w', encoding='utf-8') as file:
        json.dump(data, file, indent=4)

def set_environment_variable_tmux_session(session_name: str, key: str, value: Any) -> None:
    """
    Sets an environment variable within a running tmux session.

    Args:
        session_name (str): The name of the target tmux session.
        key (str): The environment variable key to set.
        value (Any): The value to assign to the key.
    """
    subprocess.run(["tmux", "send-keys", "-t", session_name, f"export {key}={value}", "C-m"])

def launch_parallel_experiments(task_path: str,
                                num_exp: int,
                                exp_name: str,
                                num_agents: int = 2,
                                model: str = "gpt-4o-mini",
                                api: str = "openai",
                                num_parallel: int = 1,
                                s3: bool = False,
                                bucket_name: str = "mindcraft-experiments",
                                template_profile: str = "profiles/tasks/collab_profile.json",
                                insecure_coding: bool = False,
                                url: str = "http://127.0.0.1:8000/v1",
                                max_messages: int = 15,
                                num_examples: int = 2,
                                no_pruning: bool = False,
                                block_conversation: bool = False,
                                run_in_tmux: bool = True) -> None:
    """
    Orchestrates the launch of parallel experiments and monitors their progress.

    This function splits tasks among a specified number of parallel servers,
    launches them, and then enters a monitoring loop. It periodically checks
    the experiment folder, aggregates results, prints progress, and uploads
    to S3 if configured.

    Args:
        task_path (str): Path to the task definition file.
        num_exp (int): Number of times to repeat each task.
        exp_name (str): A unique name for this experiment run.
        num_agents (int): The number of agents to use per task.
        model (str): The model name to be used by the agents.
        api (str): The API provider for the model.
        num_parallel (int): The number of parallel servers/experiments to run.
        s3 (bool): If True, upload results to S3.
        bucket_name (str): The S3 bucket to use for uploads.
        template_profile (str): Path to the agent profile template.
        insecure_coding (bool): If True, enables insecure coding mode.
        url (str): The URL for the model API (if applicable).
        max_messages (int): Maximum number of messages before summarization.
        num_examples (int): Number of examples to use in the prompt.
        no_pruning (bool): If True, disables action pruning.
        block_conversation (bool): If True, blocks conversation actions.
        run_in_tmux (bool): If True, runs servers and scripts in tmux sessions.
    """
    
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
        servers = create_server_files("./tasks/server_data/", num_parallel, world_name=world_name)
    else:
        servers = [(f"./tasks/server_data_{i}/", 55916 + i) for i in range(num_parallel)]
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

    with open(task_path, 'r') as f:
        task_definitions = json.load(f)

    while total_run < total_num_experiments:
        # Get all subfolders that have been created
        try:
            evaluated_folders = [f.path for f in os.scandir(experiments_folder) if f.is_dir()]
        except FileNotFoundError:
            evaluated_folders = []

        if not evaluated_folders:
            logging.info("No experiment folders found yet. Waiting...")
            time.sleep(60)
            continue

        results_df = aggregate_results(evaluated_folders, task_definitions)
        
        if results_df.empty:
            total_run = 0
            success_rate = 0.0
            status_dist_str = "No results yet."
        else:
            total_run = len(results_df)
            success_rate = results_df['overall_is_successful'].mean()
            status_dist = results_df['overall_completion_status'].value_counts(normalize=True).to_dict()
            status_dist_str = ", ".join([f"{k.value}: {v:.2%}" for k, v in status_dist.items()])


        logging.info(f"\n--- Progress Update ({datetime.now().strftime('%H:%M:%S')}) ---")
        logging.info(f"Total tasks run: {total_run}/{total_num_experiments}")
        logging.info(f"Overall Success Rate: {success_rate:.2%}")
        logging.info(f"Completion Status: {status_dist_str}")
        
        # Create a summary dictionary for logging
        results_summary = {
            "total_evaluated": total_run,
            "success_rate": success_rate,
            "completion_status_distribution": status_dist,
            "exp_name": exp_name,
            "template_profile": template_profile,
            "model": model,
            "api": api,
            "num_agents": num_agents,
            "task_path": task_path,
            "task_type": task_type,
            "max_messages": max_messages,
            "num_examples": num_examples
        }

        # Save summary and detailed results
        with open(f"{experiments_folder}/results.json", "w") as f:
            json.dump(results_summary, f, indent=4)
        if not results_df.empty:
            # Convert Enum members to their string values for CSV compatibility
            df_for_csv = results_df.copy()
            df_for_csv['overall_completion_status'] = df_for_csv['overall_completion_status'].apply(lambda x: x.value)
            df_for_csv.to_csv(f"{experiments_folder}/detailed_results.csv", index=False)

        if s3:
            cmd_results = f"aws s3 cp {experiments_folder}/results.json s3://{s3_path}/results.json"
            logging.info(cmd_results)
            subprocess.run(cmd_results.split(), capture_output=True, text=True)
            if not results_df.empty:
                cmd_csv = f"aws s3 cp {experiments_folder}/detailed_results.csv s3://{s3_path}/detailed_results.csv"
                logging.info(cmd_csv)
                subprocess.run(cmd_csv.split(), capture_output=True, text=True)
        
        time.sleep(60)

def launch_server_experiment(task_path: str,
                             task_ids: List[str],
                             num_exp: int,
                             server: Tuple[str, int],
                             experiments_folder: str,
                             exp_name: str = "exp",
                             num_agents: int = 2,
                             model: str = "gpt-4o",
                             api: str = "openai",
                             s3: bool = False,
                             bucket_name: str = "mindcraft-experiments",
                             template_profile: str = "profiles/tasks/collab_profile.json",
                             insecure_coding: bool = False,
                             url: str = "http://127.0.0.1:8000/v1",
                             task_type: str = "techtree",
                             s3_path: str = "",
                             max_messages: int = 15,
                             num_examples: int = 2,
                             no_pruning: bool = False,
                             block_conversation: bool = False,
                             run_in_tmux: bool = True) -> None:
    """
    Launches and configures a single server instance for running experiments.

    This function handles the setup for one of the parallel experiment instances.
    It configures server properties, creates agent profiles, sets up tmux sessions
    (if enabled), and generates the script that will run the tasks.

    Args:
        task_path (str): Path to the task definition file.
        task_ids (List[str]): The specific task IDs this server will run.
        num_exp (int): Number of times to repeat each task.
        server (Tuple[str, int]): A tuple containing the server's path and port.
        experiments_folder (str): The root folder for storing experiment results.
        exp_name (str): The name of the experiment.
        num_agents (int): The number of agents to use.
        model (str): The model name to use.
        api (str): The API provider for the model.
        s3 (bool): If True, enable S3 uploads.
        bucket_name (str): The name of the S3 bucket.
        template_profile (str): Path to the agent profile template.
        insecure_coding (bool): If True, enable insecure coding mode.
        url (str): The URL for the model API.
        task_type (str): The type of task being run.
        s3_path (str): The base S3 path for uploads.
        max_messages (int): Maximum messages before summarization.
        num_examples (int): Number of examples for the prompt.
        no_pruning (bool): If True, disable action pruning.
        block_conversation (bool): If True, block conversation actions.
        run_in_tmux (bool): If True, run in a tmux session.
    """
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
    logging.info(agent_profiles_str)
    if run_in_tmux:
        logging.info("run in tmux is true")
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
        logging.debug(agent_profiles_str)
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

def run_script(task_path: str,
               task_ids: List[str],
               num_exp: int,
               experiments_folder: str,
               agent_names: List[str],
               server_path: str,
               s3: bool = False,
               s3_path: str = "mindcraft-experiments",
               session_name: str = "0",
               run_in_tmux: bool = True) -> None:
    """
    Generates and executes a shell script to run a sequence of tasks.

    This function creates a shell script that contains the `node main.js` commands
    to run each task, along with commands to copy the resulting log files to the
    correct experiment folder and upload them to S3 if enabled.

    Args:
        task_path (str): Path to the task definition file.
        task_ids (List[str]): The list of task IDs to be run.
        num_exp (int): The number of times to repeat each task.
        experiments_folder (str): The root folder for storing results.
        agent_names (List[str]): The names of the agents participating.
        server_path (str): The path to the server directory.
        s3 (bool): If True, include S3 upload commands in the script.
        s3_path (str): The base S3 path for uploads.
        session_name (str): The tmux session name to run the script in.
        run_in_tmux (bool): If True, execute the script via tmux.
    """
    script_content = ""
    for task_id in task_ids:
        # Create a separate folder for each task_id
        task_folder = os.path.join(experiments_folder, str(task_id))
        os.makedirs(task_folder, exist_ok=True)
        assert os.path.exists(task_folder), f"Directory {task_folder} was not created"
        logging.info(f"Created directory: {task_folder}")
        
        cmd = f"node main.js --task_path \'{task_path}\' --task_id {task_id}"
        cp_cmd = f"cp {agent_names[0]}.json {server_path}bots/{agent_names[0]}/profile.json"
        for _ in range(num_exp):
            script_content += f"{cmd}\n"
            script_content += "sleep 2\n"
            for agent in agent_names:
                agent_file_path = os.path.join(task_folder, f"{agent}_{_}.json")
                script_content += f"echo 'Saving to {agent_file_path}'\n"
                cp_cmd = f"cp bots/{agent}/memory.json {agent_file_path}"
                script_content += f"echo '{cp_cmd}'\n"
                script_content += f"{cp_cmd}\n"
                script_content += "sleep 1\n"
                if s3:
                    s3_cmd = f"aws s3 cp {agent_file_path} s3://{s3_path}/{task_id}/{agent}_{_}.json"
                    script_content += f"echo 'Uploading {agent_file_path} to S3'\n"
                    script_content += f"echo '{s3_cmd}'\n"
                    script_content += f"{s3_cmd}\n"
                    script_content += "sleep 1\n"
        script_content += f"sleep 10\n"
        if s3:
            for agent in agent_names:
                script_content += f"aws s3 cp bots/{agent} s3://{s3_path}/bots/{agent} --recursive\n"

    # Create a temporary shell script file
    script_file = f"./tmp/experiment_script_{session_name}.sh"
    make_script_file_and_run(script_content, script_file, session_name=session_name, run_in_tmux=run_in_tmux)


def make_ops(agent_names: List[str], session_name: str) -> None:
    """
    Makes the specified agents operators (ops) in the Minecraft world.

    This is achieved by running a debug task to get the agents into the server,
    then issuing the /op command from the server console.

    Args:
        agent_names (List[str]): A list of agent names to be made ops.
        session_name (str): The tmux session name where the agents are running.
    """
    logging.info('Making agents operators...')

    cmd = f"node main.js --task_path tasks/example_tasks.json --task_id debug_{len(agent_names)}_agent_timeout"

    subprocess.run(["tmux", "send-keys", "-t", session_name, cmd, "C-m"])

    time.sleep(30)

    subprocess.run(["tmux", "send-keys", "-t", "server_" + session_name, f"/op @a", "C-m"])

    agents_op = check_agent_ops(agent_names, ops_file=f"./tasks/server_data_{session_name}/ops.json")
    if agents_op:
        logging.info("Agents are operators! You are good to go :D")
    else:
        logging.warning("Agents are not operators! We will need to try making them operators again!")
        make_ops(agent_names, session_name)

def check_agent_ops(agent_names: List[str], ops_file: str = "ops.json") -> bool:
    """
    Checks the ops.json file to verify that all agents are operators.

    Args:
        agent_names (List[str]): The list of agent names to check.
        ops_file (str): The path to the ops.json file.

    Returns:
        bool: True if all agents are listed in the ops file, False otherwise.
    """
    with open(ops_file, "r") as f:
        ops_data = json.load(f)
    
    ops_names = [op["name"] for op in ops_data]
    
    for agent in agent_names:
        if agent not in ops_names:
            return False 
    return True

def make_script_file_and_run(script_content: str,
                             file_name: str,
                             session_name: str = "0",
                             run_in_tmux: bool = True) -> None:
    """
    Writes content to a script file and executes it.

    Args:
        script_content (str): The shell script content to write.
        file_name (str): The path to the script file to be created.
        session_name (str): The tmux session to run the script in.
        run_in_tmux (bool): If True, run via tmux; otherwise, run directly.
    """
    script_dir = os.path.dirname(file_name)
    os.makedirs(script_dir, exist_ok=True)
    assert os.path.exists(script_dir), f"Script directory {script_dir} was not created"
    logging.info(f"Created script directory: {script_dir}")

    # Call the function before writing the script file
    with open(file_name, 'w') as f:
        f.write(script_content)
    assert os.path.exists(file_name), f"Script file {file_name} was not created"

    script_file_run = "bash " + file_name

    # Execute the shell script using subprocess
    if run_in_tmux:
        subprocess.run(["tmux", "send-keys", "-t", session_name, script_file_run, "C-m"])
    else:
        subprocess.run(script_file_run.split())

def make_profiles(agent_names: List[str],
                  models: List[str],
                  apis: List[str],
                  template_profile: str = "profiles/collab_profile.json",
                  url: str = "http://127.0.0.1:8000/v1") -> None:
    """
    Generates JSON profile files for each agent based on a template.

    Args:
        agent_names (List[str]): List of agent names.
        models (List[str]): List of model names corresponding to each agent.
        apis (List[str]): List of API providers for each agent.
        template_profile (str): Path to the template profile JSON file.
        url (str): The API URL to use for vLLM models.
    """
    assert len(agent_names) == len(models)

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

        with open(f"{agent_names[index]}.json", 'w') as f:
            json.dump(profile, f, indent=4)

def create_server_files(source_path: str, num_copies: int, world_name: str = "Forest") -> List[Tuple[str, int]]:
    """
    Creates multiple copies of server files for parallel experiments.

    Args:
        source_path (str): The path to the source server files directory.
        num_copies (int): The number of server copies to create.
        world_name (str): The name of the world to set in server.properties.

    Returns:
        List[Tuple[str, int]]: A list of tuples, each containing the path and port
                               of a created server instance.
    """
    logging.info("Creating server files...")
    logging.info(num_copies)
    servers = []
    for i in range(num_copies):
        dest_path = f"./tasks/server_data_{i}/"
        copy_server_files(source_path, dest_path)
        logging.info(dest_path)
        edit_file(dest_path + "server.properties", {"server-port": 55916 + i,
                                                    "level-name": world_name})
        # edit_server_properties_file(dest_path, 55916 + i)
        servers.append((dest_path, 55916 + i))
    return servers

def edit_file(file: str, content_dict: Dict[str, Any]) -> None:
    """
    Edits a properties-style file by replacing values for given keys.

    Args:
        file (str): The path to the file to edit.
        content_dict (Dict[str, Any]): A dictionary of key-value pairs to update.
    """
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
        logging.info(f"{file} updated with {content_dict}")
    except Exception as e:
        logging.error(f"Error editing file {file}: {e}")

def clean_up_server_files(num_copies: int) -> None:
    """
    Deletes the server file directories created for parallel experiments.

    Args:
        num_copies (int): The number of server directories to delete.
    """
    for i in range(num_copies):
        dest_path = f"./tasks/server_data_{i}/"
        delete_server_files(dest_path)

def copy_server_files(source_path: str, dest_path: str) -> None:
    """
    Recursively copies server files from a source to a destination.

    Args:
        source_path (str): The source directory.
        dest_path (str): The destination directory.
    """
    try:
        shutil.copytree(source_path, dest_path)
        logging.info(f"Server files copied to {dest_path}")
    except Exception as e:
        logging.error(f"Error copying server files: {e}")
    time.sleep(10)

    same_files = check_same_files(source_path, dest_path)
    if not same_files:
        copy_server_files(source_path, dest_path)
        logging.warning("The destination path does not contain all the same files as the source path.")
    else:
        logging.info("The destination path contains all the same files as the source path.")

def check_same_files(d1: str, d2: str) -> bool:
    """
    Checks if two directories contain the same set of file and directory names.
    This is a shallow check and does not compare file contents.

    Args:
        d1 (str): Path to the first directory.
        d2 (str): Path to the second directory.

    Returns:
        bool: True if the contents are the same, False otherwise.
    """
    try:
        items1 = set(os.listdir(d1))
        items2 = set(os.listdir(d2))
        return items1 == items2
    except FileNotFoundError as e:
        logging.error(f"Directory not found for comparison: {e}")
        return False

def delete_server_files(dest_path: str) -> None:
    """
    Deletes the server files at the specified destination path.

    Args:
        dest_path (str): The path to the server directory to delete.
    """
    try:
        shutil.rmtree(dest_path)
        logging.info(f"Server files deleted from {dest_path}")
    except Exception as e:
        logging.error(f"Error deleting server files: {e}")
    if not os.path.exists(dest_path):
        logging.info("Server files deleted successfully.")
    # else:
    #     logging.error("Error deleting server files.")
    #     delete_server_files(dest_path)
    

def launch_world(server_path: str = "./tasks/server_data/",
                 agent_names: List[str] = ["andy", "jill"],
                 session_name: str = "server",
                 port: int = 55916) -> None:
    """
    Launches the Minecraft server in a new tmux session.

    Args:
        server_path (str): The path to the server directory.
        agent_names (List[str]): A list of agent names (used for logging).
        session_name (str): The name for the new tmux session.
        port (int): The port the server will run on.
    """
    logging.info(f"Launching Minecraft world with port {port}...")
    cmd = f"cd {server_path} && java -jar server.jar"
    subprocess.run(['tmux', 'new-session', '-d', '-s', session_name], check=True)
    subprocess.run(["tmux", "send-keys", "-t", session_name, cmd, "C-m"])
    time.sleep(30) # Increased sleep time to ensure server starts
    logging.info("Server launch command sent. Continuing with experiment setup.")

def kill_world(session_name: str = "server") -> None:
    """
    Kills the Minecraft server's tmux session.

    Args:
        session_name (str): The name of the tmux session to kill.
    """
    subprocess.run(["tmux", "send-keys", "-t", session_name, "stop", "C-m"])
    time.sleep(5)
    subprocess.run(["tmux", "kill-session", "-t", session_name])

def detach_process(command: List[str]) -> int | None:
    """
    Launches a subprocess and detaches it to run independently.

    Args:
        command (List[str]): A list of strings representing the command to execute.

    Returns:
        Optional[int]: The PID of the detached process, or None on failure.
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

        logging.info(f"Process launched with PID: {process.pid}")
        return process.pid  # Return the PID of the detached process

    except FileNotFoundError:
        logging.error(f"Error: Command not found: {command}")
        return None
    except Exception as e:
        logging.error(f"An error occurred: {e}")
        return None

def main() -> None:
    """
    Main entry point for the evaluation script.

    Parses command-line arguments and orchestrates the experiment launch or
    results-checking process.
    """
    parser = argparse.ArgumentParser(description='Run Minecraft AI agent experiments')
    parser.add_argument('--no_launch_world', action='store_true', help='Do not launch the Minecraft world')
    parser.add_argument('--task_path', default="tasks/multiagent_crafting_tasks.json", help='Path to the task file')
    parser.add_argument('--num_agents', default=2, type=int, help='Number of agents to run')
    parser.add_argument('--num_exp', default=1, type=int, help='Number of experiments to run')
    parser.add_argument('--num_parallel', default=1, type=int, help='Number of parallel servers to run')
    parser.add_argument('--exp_name', default="exp", help='Name of the experiment')
    parser.add_argument('--s3', action='store_true', help='Whether to upload to s3')
    parser.add_argument('--bucket_name', default="mindcraft-experiments", help='Name of the s3 bucket')
    parser.add_argument('--add_keys', action='store_true', help='Create the keys.json to match the environment variables')
    parser.add_argument('--template_profile', default="profiles/tasks/crafting_profile.json", help='Model to use for the agents')
    parser.add_argument('--model', default="gpt-4o-mini", help='Model to use for the agents')
    parser.add_argument('--api', default="openai", help='API to use for the agents')
    # parser.add_argument('--world_name', default="Forest", help='Name of the world')
    parser.add_argument('--insecure_coding', action='store_true', help='Enable insecure coding')
    parser.add_argument('--url', default="http://127.0.0.1:8000/v1")
    parser.add_argument('--max_messages', default=15, type=int, help='Maximum number of messages before summarizing')
    parser.add_argument('--num_examples', default=2, type=int, help='Maximum number of turns before summarizing')
    parser.add_argument('--no-pruning', action='store_true', help='Disable pruning of the actions')
    parser.add_argument('--block_conversation', action='store_true', help='Block conversation actions')
    parser.add_argument('--check', metavar='FOLDER_PATH', help='Check and evaluate results in the specified folder without running experiments')
    parser.add_argument('--usernames', default="", help='Comma-separated list of usernames for the agents')

    args = parser.parse_args()
    logging.info(args)
    
    # If --check flag is provided, evaluate results in the specified folder and exit
    if args.check:
        # The check function now also requires the task definition file.
        check_folder_results(args.check, args.task_path)
        return
    
    if not args.no_launch_world:
        try:
            subprocess.run(['tmux', 'kill-server'], check=True)
        except:
            logging.info("No tmux session to kill")
    
    # delete all server files
    if not args.no_launch_world:
        clean_up_server_files(args.num_parallel)
    if args.add_keys:
        update_keys_json()

    # change task file to include usernames
    with open(args.task_path, 'r') as f:
        content = f.read()
        task = json.loads(content) 
    # check if human count for first task is non zero
    if "human_count" in task[list(task.keys())[0]]:
        # check if human count is non zero
        human_count = task[list(task.keys())[0]]["human_count"]
        username_lst = args.usernames.replace(" ", "").split(",")
        if len(username_lst) != human_count:
            raise ValueError(f"Number of usernames provided ({len(username_lst)}) does not match human count ({human_count})")
        if human_count > 0:
            for task_id in task.keys():
                task[task_id]["usernames"] = username_lst
        # dump to task_path 
        with open(args.task_path, 'w') as f:
            json.dump(task, f, indent=4)
    
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
                                run_in_tmux=not args.no_launch_world)

if __name__ == "__main__":
    main()