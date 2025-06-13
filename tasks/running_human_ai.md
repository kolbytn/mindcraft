# Human AI Instructions

## Finishing Installation 

Install the conda environment for running the experiments by executing this in your command line: 

```
conda create --name mindcraft python=3.11
conda activate mindcraft
pip install -r requirements.txt
```

## Setting up the world

Setting up the world! Make sure your world has cheats enabled! You can do this on creation of your Minecraft world in the Minecraft console, or you can type ```/op @a``` in the chat or in the console of the world launched from the jar file. 

## Construction 
Press F3 to view the coordinates of the game. And pull up the file tasks/construction_tasks/church_blueprint.pdf
Run 
```
python tasks/evaluation_script.py --no_launch_world --template_profile profiles/tasks/construction_profile.json --task_path tasks/construction_tasks/human_ai/1_agent_1_human.json --usernames YOUR_USERNAME --num_agents 1 --insecure_coding
```

## Crafting 

```
python tasks/evaluation_script.py --no_launch_world --template_profile profiles/tasks/crafting_profile.json --task_path tasks/crafting_tasks/human_ai/1_agent_1_human.json --usernames YOUR_USERNAME --num_agents 1
```

## Cooking 

```
python tasks/evaluation_script.py --no_launch_world --template_profile profiles/tasks/cooking_profile.json --task_path tasks/cooking_tasks/human_ai/1_agent_1_human.json --usernames YOUR_USERNAME --num_agents 1
```