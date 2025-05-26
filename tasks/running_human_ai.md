# Human AI Instructions

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