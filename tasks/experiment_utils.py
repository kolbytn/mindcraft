import json
import logging
import os
import re
import shutil
import subprocess
import sys
import time
from typing import Any, Dict, List, Tuple

# Set up basic logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

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
                written = False
                for key, value in content_dict.items():
                    if line.startswith(key + "="):
                        f.write(f"{key}={value}\n")
                        written = True
                        break
                if not written:
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
    time.sleep(1) # Give a moment for filesystem to catch up

    if not check_same_files(source_path, dest_path):
        logging.warning("File copy incomplete, retrying...")
        time.sleep(5)
        shutil.rmtree(dest_path)
        copy_server_files(source_path, dest_path)
    else:
        logging.info("Server files copied successfully.")


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
        if os.path.exists(dest_path):
            shutil.rmtree(dest_path)
            logging.info(f"Server files deleted from {dest_path}")
    except Exception as e:
        logging.error(f"Error deleting server files at {dest_path}: {e}")


def launch_world(server_path: str = "./tasks/server_data/",
                 session_name: str = "server",
                 port: int = 55916) -> None:
    """
    Launches the Minecraft server in a new tmux session.
    Args:
        server_path (str): The path to the server directory.
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
    try:
        subprocess.run(["tmux", "send-keys", "-t", session_name, "stop", "C-m"])
        time.sleep(5)
        subprocess.run(["tmux", "kill-session", "-t", session_name], check=True)
        logging.info(f"Successfully killed tmux session: {session_name}")
    except subprocess.CalledProcessError:
        logging.warning(f"tmux session {session_name} not found or already killed.")


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

    ops_file_path = f"./tasks/server_data_{session_name}/ops.json"
    
    # Wait for ops.json to be created and populated
    max_wait_time = 60  # seconds
    start_time = time.time()
    while time.time() - start_time < max_wait_time:
        if os.path.exists(ops_file_path) and check_agent_ops(agent_names, ops_file=ops_file_path):
            logging.info("Agents are operators! You are good to go :D")
            return
        time.sleep(5)

    logging.error("Failed to make agents operators within the time limit. Retrying...")
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
    try:
        with open(ops_file, "r") as f:
            ops_data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return False
    
    ops_names = [op["name"] for op in ops_data]
    
    return all(agent in ops_names for agent in agent_names)

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

    with open(file_name, 'w') as f:
        f.write(script_content)
    assert os.path.exists(file_name), f"Script file {file_name} was not created"

    script_file_run = "bash " + file_name

    if run_in_tmux:
        subprocess.run(["tmux", "send-keys", "-t", session_name, script_file_run, "C-m"])
    else:
        subprocess.run(script_file_run, shell=True)

def detach_process(command: List[str]) -> int | None:
    """
    Launches a subprocess and detaches it to run independently.
    Args:
        command (List[str]): A list of strings representing the command to execute.
    Returns:
        Optional[int]: The PID of the detached process, or None on failure.
    """
    try:
        kwargs = {}
        if sys.platform == 'win32':
            kwargs.update(creationflags=subprocess.CREATE_NEW_PROCESS_GROUP)
        else:
            kwargs.update(preexec_fn=os.setsid)

        process = subprocess.Popen(command,
                                   stdin=subprocess.PIPE,
                                   stdout=subprocess.PIPE,
                                   stderr=subprocess.PIPE,
                                   close_fds=True,
                                   **kwargs)

        logging.info(f"Process launched with PID: {process.pid}")
        return process.pid

    except FileNotFoundError:
        logging.error(f"Error: Command not found: {command}")
        return None
    except Exception as e:
        logging.error(f"An error occurred: {e}")
        return None