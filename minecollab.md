# MineCollab

## Tasks 

### Cooking

### Crafting

### Construction

## Installation 

Please follow the installation docs in the README to install mindcraft. You can create a docker image using the Dockerfile. 

First, download the relevant task files and server data files. The tasks files are for specifying the tasks to run and the server data is for allowing the models to launch the task in the correct world automatically. Unzip the server_data.zip in the base mindcraft/ folder. 

Then, set up your conda environment: `conda create --name mindcraft --file requirements.txt`

Then, you can run the evaluation_script using `python evaluation_script.py --task_path {your-task-path} --model {model you want to use}`. 

If you want to run with vllm be sure to run with `--api vllm --url {your_url_for_vllm}`, by default vllm will use http://127.0.0.1:8000/v1 as the url for quering the model!

When running with construction tasks, make sure to set the flag `--insecure_coding` so that the agents can be allowed to write freeform javascript code to complete the tasks. However, when using insecure coding it is highly recommended to use 