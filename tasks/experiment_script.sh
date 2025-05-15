python3 tasks/evaluation_script.py --model claude-3-5-sonnet-latest --num_parallel 1 --num_exp 1 --exp_name "claude_2_agent_block_recipe" --template_profile ./profiles/tasks/cooking_profile.json --task_path tasks/cooking_tasks/require_collab_test_2_items/2_agent_hells_kitchen_full.json --num_agents 2
sleep 360 
python3 tasks/evaluation_script.py --model claude-3-5-sonnet-latest --num_parallel 1 --num_exp 1 --exp_name "claude_2_agent_block_recipe" --template_profile ./profiles/tasks/cooking_profile.json --task_path tasks/cooking_tasks/require_collab_test_2_items/2_agent_full.json --num_agents 2
sleep 360 
python3 tasks/evaluation_script.py --model gpt-4o --num_parallel 1 --num_exp 1 --exp_name "4o_2_agent_block_recipe" --template_profile ./profiles/tasks/cooking_profile.json --task_path tasks/cooking_tasks/require_collab_test_2_items/2_agent_hells_kitchen_full.json --num_agents 2
sleep 360
python3 tasks/evaluation_script.py --model gpt-4o --num_parallel 1 --num_exp 1 --exp_name "4o_2_agent_block_recipe" --template_profile ./profiles/tasks/cooking_profile.json --task_path tasks/cooking_tasks/require_collab_test_2_items/2_agent_full.json --num_agents 2
sleep 360 
python3 tasks/evaluation_script.py --model gpt-4o --num_parallel 1 --num_exp 1 --exp_name "claude_2_agent_block_recipe" --template_profile ./profiles/tasks/cooking_profile.json --task_path tasks/cooking_tasks/require_collab_test_2_items/2_agent_block_recipe_full.json --num_agents 2