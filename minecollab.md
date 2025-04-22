# MineCollab

MineCollab is a versatile benchmark for assessing the embodied and collaborative communication abilities of agents across three unique types of tasks. 

## Installation 

Please follow the installation docs in the README to install mindcraft. You can create a docker image using the Dockerfile. 

Download the relevant task files and server data files, you can find the link [here](https://drive.google.com/drive/folders/1XygbitBBTsNO6q_doEiZHmdETpnyRmCS). The tasks files are for specifying the tasks to run and the server data is for allowing the models to launch the task in the correct world automatically. Unzip the server_data.zip in the base `tasks/` folder. 

Then, set up your conda environment: `conda create --name mindcraft --file requirements.txt`

Then, you can run the evaluation_script **from the project root** using `python tasks/evaluation_script.py --task_path {your-task-path} --model {model you want to use}`. 

If you want to run with vllm be sure to run with `--api vllm --url {your_url_for_vllm} --model {model_name}`, by default vllm will use http://127.0.0.1:8000/v1 as the url for quering the model!

When running with construction tasks, make sure to set the flag `--insecure_coding` so that the agents can be allowed to write freeform javascript code to complete the tasks. However, when using insecure coding it is highly recommended to use a docker container to avoid damage to your computer. 

When running an experiment that requires more than 2 agents, use the `--num_agents` flag to match the number of agents in your task file. For example, if you are running a task file with 3 agents, use `--num_agents 3`. 

Similarly, match the default prompt profile to the type of task. If you are running a crafting task use `--template_profile profiles/tasks/crafting_profile.json` to set that as the default profile. Similar for cooking and construction tasks. 

In summary, to run two and three agent tasks on crafting  on gpt-4o-mini you would run 

```
python evaluation_script.py --task_path {path_to_two_agent_crafting_tasks} --model gpt-4o-mini --template_profile profiles/tasks/crafting_profile.json

python evaluation_script.py --task_path {path_to_three_agent_crafting_tasks} --model gpt-4o-mini --template_profile profiles/tasks/crafting_profile --num_agents 3
```

For cooking and construction 

```
python evaluation_script.py --task_path {path_to_two_agent_cooking_tasks} --model gpt-4o-mini --template_profile profiles/tasks/cooking_profile.json 

python evaluation_script.py --task_path {path_to_two_agent_construction_tasks} --model gpt-4o-mini --template_profile profiles/tasks/construction_profile.json --insecure_coding
```

## Using the Evaluation Script

When you launch with `python evaluation_script.py` a Minecraft server will be launched in the `server_0` tmux shell, while in the `0` tmux shell the `node main.js` command will be run. You can view the exact bash shell that is being created and executed in the `tmp/` directory. 

### Evaluating Results 

As you run, the evalaution script will evaluate the performance so far. It will also log all of the results you have collected into an experiments/ folder with entries like experiments/exp_04-21_16-16/results.txt which will contain the results of your experiments after you have finished running them. Furthermore it will contain individual task folders and the `memory.json` for each agent when the task ended. The `memory.json` is not the complete conversation, it is only the last 15 messages before the task terminated, as well as a message saying `Task ended with score: ` to report the score when the task ended. For crafting and cooking this score will be 0 or 1, for construction it will be a decimal representing the edit distance from the true blueprint.

### Running multiple worlds in parallel

You can use `--num_parallel` to run multiple Minecraft worlds in parallel. This will launch `n` tmux shells, claled `server_i` and shell `i`, where `i` corresponds to ith parallel world. It will also copy worlds into `server_data_i` as well. On an M3 Mac with 34 GB of RAM, we can normally support up to 4 parallel worlds. When running an open source model, it is more likely you will be constrained by the throughput and size of your GPU RAM. On a cluster of 8 H100s you can expect to run 4 experiments in parallel. However, for best performance it is advisable to only use one parallel world. 

### Using an S3 Bucket to store files 
To use S3 set the --s3 flag and the --bucket_name to use an s3 bucket to log all the files collected. It will also copy the /bots folder in this case with all of the files in there. 