import mindcraft
import json
import os

# Initialize Mindcraft, starting the Node.js server
# This will also connect to the MindServer via websockets
mindcraft.init()

# Get the directory of the current script
script_dir = os.path.dirname(os.path.abspath(__file__))
profile_path = os.path.abspath(os.path.join(script_dir, '..', '..', 'andy.json'))

# Load agent settings from a JSON file
try:
    with open(profile_path, 'r') as f:
        profile_data = json.load(f)
    
    settings = {"profile": profile_data}
    mindcraft.create_agent(settings)

    settings_copy = settings.copy()
    settings_copy['profile']['name'] = 'andy2'
    mindcraft.create_agent(settings_copy)
except FileNotFoundError:
    print(f"Error: Could not find andy.json at {profile_path}")

mindcraft.wait()
