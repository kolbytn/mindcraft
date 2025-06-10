# MineCollab

MineCollab is a versatile benchmark for assessing the embodied and collaborative communication abilities of agents across three unique types of tasks. 

## Existing Task Types

### Cooking
At the beginning of a cooking task episode, the agents are initialized with a goal to make a meal, e.g. they need to make cake and bread.
The agents then need to coordinate the collection of ingredients through natural language communication (e.g. Andy collects wheat for the bread while Jill makes the cake) and combine them in a multi-step plan. 
To assist them in collecting resources, agents are placed in a "cooking world" that possesses all of the items they need to complete the task, from livestock, to crops, to a smoker, furnace, and crafting table.
Following a popular test of collaboration in humans, we further introduce a ``Hell's Kitchen'' variant of the cooking tasks where each agent is given the recipes for a small subset of the items they need to cook and must communicate the instructions with the other teammates.
For example, if the task is to make a baked potato and a cake, one agent is given recipe for baked potato, but is required to bake the cake to complete the task, forcing them to ask their teammate for help in baking the potato.
Agents are evaluated on whether are successfully able to complete the set requirements to make the recipes.
The environment and objectives of the tasks are randomized every episode.

You can view the cooking task in action [here](https://www.youtube.com/shorts/FbNJ3cR_RWY).

### Construction

In the construction tasks, agents are directed to build structures from procedurally generated blueprints.
Blueprints can also be downloaded from the internet and read into our blueprint format - enabling agents to build anything from pyramids to the Eiffel Tower. 
We choose evaluate primarily on our generated blueprints as they provide fine-grained control over task complexity, allowing us to systematically vary the depth of collaboration required---e.g. number of rooms in the interior of palace, or the amount and types of materials required for each room.
At the beginning of each episode, agents are initialized with the blueprint, materials (e.g. stone, wood, doors, carpets) in such a way that no agent has the full resources or the expertise in terms of the types of tools that can be used to process the resources and complete the entire blueprint.
For example, if the blueprint required a stone base and a wooden roof, one agent would be given access and the ability to manipulate stone, the other to wood.
Agents are evaluated via an edit distance based metric that judges how close their constructed building is to the blueprint and the metric reported is the average of those edit distance scores.

You can view the construction task in action [here](https://www.youtube.com/shorts/vuBycbn35Rw)

### Crafting 

Crafting has long been the subject of Minecraft agent research---our crafting tasks encompass the entire breadth of items that are craftable in Minecraft including clothing, furniture, and tools.  
At the beginning of each episode, the agents are initialized with a goal (e.g. make a bookshelf), different sets of resources (e.g. books and planks), and access to a crafting recipe, that is occasionally blocked.
To complete the task, the agents must: (1) communicate with each other what items are in their inventory; (2) share with each other the crafting recipe if necessary; and (3) give each other resources to successfully craft the item.
To make the crafting tasks more challenging, agents are given longer crafting objectives (e.g. crafting a compass which requires multiple steps).
%They are required to coordinate their actions by communicating their plans with each other as no
%we introduce longer crafting recipes (e.g. crafting a compass), and require the agents to communicate the plan to each other.
Once again, each of these components can be controlled to procedurally generate tasks.

You can view the crafting task in action [here](https://www.youtube.com/shorts/VMAyxwMKiBc).


## Installation 

You **DO NOT** need Linux to run this, you can run on Windows with the --no-launch-world flag and by installing git bash. 

Please follow the installation docs in the README to install mindcraft. You can create a docker image using the Dockerfile. 

If you don't own Minecraft you can run a limited version solely for offline games using these instructions: 
1. Download the TLauncher https://tlauncher.org/en/
2. Enter a username and select version 1.21.1
3. Click "Multiplayer" and then "Direct Connection"
4. Then enter "localhost:55916" and hit `Join Server`

Download the relevant task files and server data files, you can find the link [here](https://drive.google.com/drive/folders/1XygbitBBTsNO6q_doEiZHmdETpnyRmCS). The tasks files are for specifying the tasks to run and the server data is for allowing the models to launch the task in the correct world automatically. **Unzip the server_data.zip in the base `tasks/` folder**.

Then, set up your conda environment: 

```
conda create --name mindcraft python=3.11
conda activate mindcraft
pip install -r requirements.txt
```

Then, you can run the evaluation_script **from the project root** using `python tasks/evaluation_script.py --task_path {your-task-path} --model {model you want to use}`. 

### Tmux Installation
**MacOS**: 
1. If brew isn't already installed run `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`
2. `brew install tmux`

**Linux**: `apt-get -y install tmux`

**Windows**: You can not use tmux on Windows, but you can run tasks with the --no-launch-world flag. Run
```
cd /tasks/server_data/
java -jar server.jar
```

If you want to run with vllm be sure to run with `--api vllm --url {your_url_for_vllm} --model {model_name}`, by default vllm will use http://127.0.0.1:8000/v1 as the url for quering the model!

When running with construction tasks, make sure to set the flag `--insecure_coding` so that the agents can be allowed to write freeform javascript code to complete the tasks. However, when using insecure coding it is **highly recommended** to use a docker container to avoid damage to your computer. 

When running an experiment that requires more than 2 agents, use the `--num_agents` flag to match the number of agents in your task file. For example, if you are running a task file with 3 agents, use `--num_agents 3`. 

Similarly, match the default prompt profile to the type of task. If you are running a crafting task use `--template_profile profiles/tasks/crafting_profile.json` to set that as the default profile. Similar for cooking and construction tasks. 

In summary, to run two and three agent tasks on crafting  on gpt-4o-mini you would run 

```
python tasks/evaluation_script.py --task_path tasks/crafting_tasks/test_tasks/2_agent.json --model gpt-4o-mini --template_profile profiles/tasks/crafting_profile.json

python tasks/evaluation_script.py --task_path tasks/crafting_tasks/test_tasks/filtered_tasks_3_agents.json --model gpt-4o-mini --template_profile profiles/tasks/crafting_profile --num_agents 3
```

For cooking and construction 

```
python tasks/evaluation_script.py --task_path {path_to_two_agent_cooking_tasks} --model gpt-4o-mini --template_profile profiles/tasks/cooking_profile.json 

python tasks/evaluation_script.py --task_path {path_to_two_agent_construction_tasks} --model gpt-4o-mini --template_profile profiles/tasks/construction_profile.json --insecure_coding
```

When you launch the evaluation script, you will see the minecraft server being launched. If you want to join this world, you can connect to it on the port localhost:55916 the way you would a standard Minecraft world (go to single player -> direct connection -> type in localhost:55916) It may take a few minutes for everything to be properly loaded - as first the agents need to be added to the world and given the correct permissions to use cheats and add inventory. After about 5 minutes everything should be loaded and working. If you wish to kill the experiment run `tmux kill-server`. Sometimes there will be issues copying the files, if this happens you can run the python file twice. 

## Windows Installation (without tmux)

If you are on a machine that can't run tmux (like a Windows PC without WSL) or you don't care about doing evaluations only running tasks you can run the following script 

```
python tasks/run_task_file.py --task_path=tasks/single_agent/crafting_train.json
```

## Using the Evaluation Script

When you launch with `python evaluation_script.py` a Minecraft server will be launched in the `server_0` tmux shell, while in the `0` tmux shell the `node main.js` command will be run. You can view the exact bash shell that is being created and executed in the `tmp/` directory. 

### Evaluating Results 

As you run, the evalaution script will evaluate the performance so far. It will also log all of the results you have collected into an experiments/ folder with entries like experiments/exp_04-21_16-16/results.txt which will contain the results of your experiments after you have finished running them. Furthermore it will contain individual task folders and the `memory.json` for each agent when the task ended. The `memory.json` is not the complete conversation, it is only the last 15 messages before the task terminated, as well as a message saying `Task ended with score: ` to report the score when the task ended. For crafting and cooking this score will be 0 or 1, for construction it will be a decimal representing the edit distance from the true blueprint.

### Running multiple worlds in parallel

You can use `--num_parallel` to run multiple Minecraft worlds in parallel. This will launch `n` tmux shells, called `server_i` and shell `i`, where `i` corresponds to ith parallel world. It will also copy worlds into `server_data_i` as well. On an M3 Mac with 34 GB of RAM, we can normally support up to 4 parallel worlds. When running an open source model, it is more likely you will be constrained by the throughput and size of your GPU RAM. On a cluster of 8 H100s you can expect to run 4 experiments in parallel. However, for best performance it is advisable to only use one parallel world. 

### Using an S3 Bucket to store files 
To use S3 set the --s3 flag and the --bucket_name to use an s3 bucket to log all the files collected. It will also copy the /bots folder in this case with all of the files in there. 

## Understanding Task Json

This is an example task json from the crafting tasks file. 

```
"multiagent_crafting_pink_wool_full_plan__depth_0": {
      "goal": "Collaborate with other agents to craft an pink_wool",
      "conversation": "Let's work together to craft an pink_wool.",
      "initial_inventory": {
        "0": {
          "pink_dye": 1
        },
        "1": {
          "black_wool": 1
        }
      },
      "agent_count": 2,
      "target": "pink_wool",
      "number_of_target": 1,
      "type": "techtree",
      "max_depth": 1,
      "depth": 0,
      "timeout": 300,
      "blocked_actions": {
        "0": [],
        "1": []
      },
      "missing_items": [],
      "requires_ctable": false
    },
```

The "initial inventory" specifies what items will be given to the agents when they spawn in the world. The "target" indicates what the goal item is, while the "type" indicates that this a techtree or crafting task. Blocked actions specifies what actions are blocked and the timeout specifies the number of seconds until the agents run out of time to complete the task. 

## Creating New Tasks

To create a new task, you simply need to set the initial inventory and the target item. For construction tasks, you can set a new blueprint. See examples of those in tasks/construction_tasks/

To create a task that relies on neither an inventory check or a blueprint check, you will need to design you own evaluation function. The examples for our existing evaluation functions can be found in src/agent/tasks/cooking_tasks.js CookingTaskValidator. For any further questions please contact me at i2white@ucsd.edu. 

## Creating New Worlds 

To add new worlds to the minecraft environment beyond the base Forest and Superflat worlds we have created, please (1) create a world in your version of Minecraft then (2) copy the world files into the server_data folder and (3) set server.properties file level-name to be the same as the name of the world you created. 

## Evaluating New Models

To evaluate a new model on our tasks, please refer to the instructions on main README for adding models. If the model can be hosted through vllm, consider using the --vllm flag and instructions above for running that.

