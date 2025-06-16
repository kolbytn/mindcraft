import argparse
import json
import subprocess
import time
from datetime import datetime
import os
import logging
import pandas as pd

# Set up basic logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

from tasks.evaluation import (
    aggregate_results,
    check_folder_results,
)

from tasks.experiment_utils import (
    update_keys_json,
    set_environment_variable_tmux_session,
    make_profiles,
    create_server_files,
    edit_file,
    clean_up_server_files,
    launch_world,
    make_ops,
    make_script_file_and_run,
)

from typing import List, Dict, Any, Tuple

# Task-specific blocked actions constants
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
    else:
        world_name = "Forest"  # Default fallback

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

    # start experiments
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
            status_dist_str = ", ".join([f"{k}: {v:.2%}" for k, v in status_dist.items()])

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
            json.dump(results_summary, f, indent=4, default=str)
        if not results_df.empty:
            results_df.to_csv(f"{experiments_folder}/detailed_results.csv", index=False)

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
        launch_world(server_path, session_name="server_" + session_name, port=server_port)
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
        except subprocess.CalledProcessError:
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