import random
import json
from typing import Dict, List, Any, Tuple, Set
from collections import Counter, defaultdict
import os
import numpy as np
import itertools

# Define your COOKING_ITEMS dictionary here
# This is where you should put your complete COOKING_ITEMS dictionary
COOKING_ITEMS = {
# Cooked Meats
"cooked_mutton": {
    "recipe": [
        "Step 1: Kill a sheep and pick up 1 mutton that is dropped.", 
        "Step 2: Get coal from your inventory or other agents.",
        "Step 3: Put coal in the furnace",
        "Step 4: Go to furnace and use it to cook the mutton."
    ],
    "description": "Cooked mutton meat",
    "complexity": "easy", 
    "required_chest_items": {
        "coal": 1,
    }
},
"cooked_beef": {
    "recipe": [
        "Step 1: Kill a cow and pick up 1 beef that is dropped.",
        "Step 2: Get coal from your inventory or other agents.",
        "Step 3: Put coal in the furnace",
        "Step 4: Go to furnace and use it to cook the beef."
    ],
    "description": "Cooked beef meat",
    "complexity": "easy", 
    "required_chest_items": {
        "coal": 1,
    }
},
"cooked_porkchop": {
    "recipe": [
        "Step 1: Kill a pig and pick up 1 porkchop that is dropped.",
        "Step 2: Get coal from your inventory or other agents.",
        "Step 3: Put coal in the furnace",
        "Step 4: Go to furnace and use it to cook the porkchop."
    ],
    "description": "Cooked porkchop",
    "complexity": "easy", 
    "required_chest_items": {
        "coal": 1,
    }
},
"cooked_chicken": {
    "recipe": [
        "Step 1: Kill a chicken and pick up 1 raw chicken that is dropped.",
        "Step 2: Get coal from your inventory or other agents.",
        "Step 3: Put coal in the furnace",
        "Step 4: Go to furnace and use it to cook the raw chicken."
    ],
    "description": "Cooked chicken meat",
    "complexity": "easy", 
    "required_chest_items": {
        "coal": 1,
    }
},
"cooked_rabbit": {
    "recipe": [
        "Step 1: Kill a rabbit and pick up 1 raw rabbit that is dropped.",
        "Step 2: Get coal from your inventory or other agents.",
        "Step 3: Put coal in the furnace",
        "Step 2: Go to furnace and use it to cook the raw rabbit."
    ],
    "description": "Cooked rabbit meat",
    "complexity": "easy", 
    "required_chest_items": {
        "coal": 1,
    }
},

# Soups and Stews
"beetroot_soup": {
    "recipe": [
        "Step 1: Go to the farm and collect 6 beetroot.",
        "Step 2: From your inventory or other agents get a bowl.",
        "Step 3: Go to the crafting table and combine the 6 beetroot and 1 bowl to make beetroot soup."
    ],
    "description": "A hearty beetroot soup",
    "complexity": "medium", 
    "required_chest_items": {
        "bowl": 1,
    }
},
"mushroom_stew": {
    "recipe": [
        "Step 1: Go to the farm and collect 1 red mushroom and 1 brown mushroom.",
        "Step 2: From your inventory or other agents get a bowl.",
        "Step 3: Go to the crafting table and combine both the mushrooms and bowl to make mushroom stew."
    ],
    "description": "A warm mushroom stew",
    "complexity": "medium", 
    "required_chest_items": {
        "bowl": 1,
    }
},
"rabbit_stew": {
    "recipe": [
        "Step 1: Go to the farm and collect 1 carrot, 1 potato, and 1 brown mushroom (search for 'potatoes' (not 'potato').",
        "Step 2: Get coal from your inventory or other agents.",
        "Step 3: Put coal in the furnace",
        "Step 4: Go to the furnace and bake the potato.",
        "Step 5: From your inventory or other agents get a bowl",
        "Step 6: Kill a rabbit and pick up 1 raw rabbit that is dropped.",
        "Step 7: Go to the furnace and cook the raw rabbit.",
        "Step 8: Go to the crafting table and combine the cooked rabbit, baked potato, carrot, brown mushroom, and bowl to make rabbit stew."
    ],
    "description": "A hearty rabbit stew",
    "complexity": "hard", 
    "required_chest_items": {
        "bowl": 1,
    }
},
"suspicious_stew": {
    "recipe": [
        "Step 1: Go to the farm and collect 1 red mushroom, 1 brown mushroom.",
        "Step 2: From your inventory or other agents get a bowl and 1 dandelion",
        "Step 3: Go to the crafting table and combine the mushrooms, dandelion, and bowl to make suspicious stew."
    ],
    "description": "A mysterious stew with special effects",
    "complexity": "medium", 
    "required_chest_items": {
        "bowl": 1,
        "dandelion": 1,
    }
},

# Baked Goods
"baked_potato": {
    "recipe": [
        "Step 1: Go to the farm and collect 1 potato (search for 'potatoes' (not 'potato')).",
        "Step 2: Get coal from your inventory or other agents.",
        "Step 3: Put coal in the furnace",
        "Step 2: Go to the furnace and bake the potato."
    ],
    "description": "A simple baked potato",
    "complexity": "easy", 
    "required_chest_items": {
        "coal": 1,
    }
},
"bread": {
    "recipe": [
        "Step 1: Go to the farm and collect 3 wheat.",
        "Step 2: Go to the crafting table and use the wheat to craft bread."
    ],
    "description": "Fresh bread",
    "complexity": "medium"
},
"cake": {
    "recipe": [
        "Step 1: Go to the farm and collect 3 wheat, 2 sugar cane.",
        "Step 2: From your inventory or other agents get 3 milk buckets (already filled with milk).",
        "Step 3: Get an egg from your inventory or other agents.",
        "Step 4: Go to the crafting table and craft the sugarcane into sugar.",
        "Step 5: Go to the crafting table and combine all ingredients (3 wheat, 2 sugar, 1 egg, and milk bucket) to make a cake."
    ],
    "description": "A delicious cake",
    "complexity": "hard", 
    "required_chest_items": {
        "milk_bucket": 3,
        "egg": 1,
    }
},
"cookie": {
    "recipe": [
        "Step 1: Go to the farm and collect 2 wheat.",
        "Step 2: Get 1 cocoa bean from your inventory or other agents.",
        "Step 3: Go to the crafting table and combine the wheat and cocoa bean to craft a cookie."
    ],
    "description": "Sweet cookies",
    "complexity": "medium", 
    "required_chest_items": {
        "cocoa_beans": 1,
    }
},
"pumpkin_pie": {
    "recipe": [
        "Step 1: Go to the farm and collect 1 pumpkin and 1 sugar cane.",
        "Step 2: Get 1 egg from your inventory or other bots",
        "Step 3: Go to the crafting table and craft the sugar cane into sugar.",
        "Step 4: Go to the crafting table and combine the pumpkin, egg, and sugar to make a pumpkin pie."
    ],
    "description": "Delicious pumpkin pie",
    "complexity": "hard", 
    "required_chest_items": {
        "egg": 1,
    }
},

# Sweet Foods
"golden_apple": {
    "recipe": [
        "Step 1: Get 1 apple and 8 gold ingots from your inventory or other bots.",
        "Step 2: Go to the crafting table and surround the apple with the gold ingots to create a golden apple."
    ],
    "description": "A magical golden apple",
    "complexity": "hard", 
    "required_chest_items": {
        "gold_ingot": 8,
        "apple": 1
    }
},

# Special Foods
"golden_carrot": {
    "recipe": [
        "Step 1: Go to the farm and collect 1 carrot.",
        "Step 2: Go to the chest and collect gold ingots and convert them to gold nuggets.",
        "Step 3: Go to the crafting table and surround the carrot with gold nuggets to create a golden carrot."
    ],
    "description": "A magical golden carrot",
    "complexity": "hard", 
    "required_chest_items": {
        "gold_ingot": 8,
    }
},

}

chest_items = {
    "milk_bucket": 3,
    "egg": 16,
    "dandelion": 64,
    "cocoa_beans": 64,
    "apple": 64,
    "gold_ingot": 8,
    "salmon": 64,
    "cod": 64,
    "kelp": 64,
    "dried_kelp": 64,
    "sweet_berries": 64,
    "honey_bottle": 1,
    "glow_berries": 64,
    "bowl": 1,
    "cooked_salmon": 1,
    "cooked_cod": 1,
    "oak_planks": 64,
    "iron_ingot": 64,
}

def make_initial_inventory(items, num_agents):
    """
    Evenly split inventory between the agents for a given set of items and number of agents
    """
    inventory = {}
    for item in items:
        if item in COOKING_ITEMS:
            cooking_info = COOKING_ITEMS[item]
            for chest_item, quantity in cooking_info.get("required_chest_items", {}).items():
                inventory[chest_item] = inventory.get(chest_item, 0) + quantity
        else:
            print(f"item {item} not found in COOKING_ITEMS.")
    initial_inventory = {}
    for i in range(num_agents):
        initial_inventory[i] = {}
    items_lst = list(inventory.keys())
    for i in range(len(items_lst)):
        item_counts = count_items_in_inventory(initial_inventory)
        agent_num = np.argmin(item_counts)
        if inventory[items_lst[i]] == 1:
            initial_inventory[agent_num][items_lst[i]] = 1
        elif inventory[items_lst[i]] > 1:
            div = inventory[items_lst[i]] // num_agents
            rem = inventory[items_lst[i]] % num_agents
            for j in range(num_agents):
                initial_inventory[j][items_lst[i]] = div
            j = 0
            while j < rem:
                initial_inventory[j][items_lst[i]] += 1
                j += 1
    return initial_inventory

def count_items_in_inventory(inventory):
    item_counts = []
    for key in inventory.keys():
        agent_inventory = inventory[key]
        total_items = 0
        for item in agent_inventory.keys():
            total_items += agent_inventory[item]
        item_counts.append(total_items)
    return item_counts

def make_all_possible_tasks(items: List[str], num_items:int, num_agents: int, output_file) -> List[Dict[str, Any]]:
    combinations = itertools.combinations(items, num_items)
    already_completed = [["bread", "golden_apple"], ["golden_apple", "rabbit_stew"], ["bread", "cake"], ["baked_potato", "golden_apple"], ["baked_potato", "cake"], ["cooked_beef", "golden_apple"]]
    remaining_combinations = set(combinations) - set(tuple(sorted(comb)) for comb in already_completed)
    tasks = {}
    for combination in remaining_combinations:
        task = {}
        task["type"] = "cooking"
        task["recipes"] = {}
        task["agent_count"] = num_agents
        task["target"] = {}
        for item in combination:
            task["target"][item] = 1
        for item in combination:
            if item in COOKING_ITEMS:
                task["recipes"][item] = COOKING_ITEMS[item]["recipe"]
            else:
                print(f"item {item} not found in COOKING_ITEMS.")
        initial_inventory = make_initial_inventory(combination, num_agents)
        task["initial_inventory"] = initial_inventory
        task["goal"] = {}
        goal_str = f"Collaborate with other agents around you to make "
        conversation_str = f"Let's collaborate to make "
        for item in combination:
            goal_str += item + ", "
            conversation_str += item + ", "
        recipe_goal_str = goal_str + "The recipes are as follows:\n"
        for item in combination:
            recipe_goal_str += f"Recipe for {item}:\n{COOKING_ITEMS[item]['recipe']}\n"
        for i in range(num_agents):
            task["goal"][i] = recipe_goal_str
        task["conversation"] = conversation_str
        partial_plan_task = task.copy()
        partial_plan_task["goal"] = {}
        for i in range(num_agents):
            partial_plan_task["goal"][i] = goal_str
        partial_plan_task["goal"][0] = recipe_goal_str
        task_id = "multiagent_cooking"
        for item in combination:
            task_id += "_" + item
        # tasks[task_id] = task
        tasks[task_id + "_partial_plan"] = partial_plan_task
    with open(output_file, 'w') as f:
        json.dump(tasks, f, indent=4)



def reconfigure_tasks(task_path, new_task_path, num_agents=None, hells_kitchen=False):
    with open(task_path, 'r') as f:
        tasks = json.load(f)
    task_ids = tasks.keys()
    new_tasks = {}
    for task_id in task_ids:
        task = tasks[task_id]
        if task["type"] == "cooking":
            items = task["recipes"].keys()
            new_recipes = {}
            inventory = {}
            for item in items:
                if item in COOKING_ITEMS:
                    cooking_info = COOKING_ITEMS[item]
                    new_recipes[item] = cooking_info["recipe"]
                    for chest_item, quantity in cooking_info.get("required_chest_items", {}).items():
                        inventory[chest_item] = inventory.get(chest_item, 0) + quantity
                else:
                    print(f"item {item} not found in COOKING_ITEMS.")
            task["recipes"] = new_recipes
            # assign inventory to the agents
            if num_agents is None:
                num_agents = task.get("agent_count", 0) + task.get("human_count", 0)
            else:
                task["agent_count"] = num_agents
            initial_inventory = {}
            for i in range(num_agents):
                initial_inventory[i] = {}
            items_lst = list(inventory.keys())
            for i in range(len(items_lst)):
                item_counts = count_items_in_inventory(initial_inventory)
                agent_num = np.argmin(item_counts)
                if inventory[items_lst[i]] == 1:
                    initial_inventory[agent_num][items_lst[i]] = 1
                elif inventory[items_lst[i]] > 1:
                    div = inventory[items_lst[i]] // num_agents
                    rem = inventory[items_lst[i]] % num_agents
                    for j in range(num_agents):
                        initial_inventory[j][items_lst[i]] = div
                    j = 0
                    while j < rem:
                        initial_inventory[j][items_lst[i]] += 1
                        j += 1
                # initial_inventory[agent_num][items_lst[i]] = inventory[items_lst[i]]
            item_counts = count_items_in_inventory(initial_inventory)
            required_collab = True
            for i in range(len(item_counts)):
                if item_counts[i] == 0:
                    # don't add the task if collaboration isn't required
                    required_collab = False
            if not required_collab:
                print(f"task {task_id} doesn't require collaboration.")
                continue
            task["initial_inventory"] = initial_inventory
            print(inventory)
            print(initial_inventory)
            if not hells_kitchen:
                goals = task.get("goal", {})
                new_goals = {}
                blocked_access = task.get("blocked_access_to_recipe", [])
                print(blocked_access)
                for key, goal in goals.items():
                    initial_goal = goal.split("\n")[0]
                    if str(key) not in blocked_access:
                        for item, recipe in new_recipes.items():
                            initial_goal += f"Recipe for {item}:\n{recipe}"
                    new_goals[key] = initial_goal
                task["goal"] = new_goals
            new_tasks[task_id] = task
                # check each of the recipes and replace with the new recipe

    os.makedirs(os.path.dirname(new_task_path), exist_ok=True)
    with open(new_task_path, 'w') as f:
        json.dump(new_tasks, f, indent=4)

def block_recipe_in_tasks(task_path, new_task_path, num_agents=None):
    with open(task_path, 'r') as f:
        tasks = json.load(f)
    task_ids = tasks.keys()
    for task_id in task_ids:
        task = tasks[task_id]
        task["blocked_access_to_recipe"] = ["0"]
        items = task["recipes"].keys()
        goal_str = "Collaborate with other agents around you to make " + ", ".join(items) + "."
        task["goal"]["0"] = goal_str
    with open(new_task_path, 'w') as f:
        json.dump(tasks, f, indent=4)



# reconfigure_tasks("mindcraft/tasks/cooking_tasks/test_tasks/3_agent_cooking_test_tasks.json", "mindcraft/tasks/cooking_tasks/require_collab_test_3_items/2_agent.json", 2)
# reconfigure_tasks("mindcraft/tasks/cooking_tasks/test_tasks/3_agent_cooking_test_tasks.json", "mindcraft/tasks/cooking_tasks/require_collab_test_3_items/3_agent.json", 3)
# reconfigure_tasks("mindcraft/tasks/cooking_tasks/test_tasks/3_agent_cooking_test_tasks.json", "mindcraft/tasks/cooking_tasks/require_collab_test_3_items/4_agent.json", 4)
# reconfigure_tasks("mindcraft/tasks/cooking_tasks/test_tasks/3_agent_cooking_test_tasks.json", "mindcraft/tasks/cooking_tasks/require_collab_test_3_items/5_agent.json", 5)

# reconfigure_tasks("mindcraft/tasks/cooking_tasks/test_tasks/2_agent_cooking_test_tasks.json", "mindcraft/tasks/cooking_tasks/require_collab_test_2_items/2_agent.json", 2)
# reconfigure_tasks("mindcraft/tasks/cooking_tasks/test_tasks/2_agent_cooking_test_tasks.json", "mindcraft/tasks/cooking_tasks/require_collab_test_2_items/3_agent.json", 3)
# reconfigure_tasks("mindcraft/tasks/cooking_tasks/test_tasks/2_agent_cooking_test_tasks.json", "mindcraft/tasks/cooking_tasks/require_collab_test_2_items/4_agent.json", 4)
# reconfigure_tasks("mindcraft/tasks/cooking_tasks/test_tasks/2_agent_cooking_test_tasks.json", "mindcraft/tasks/cooking_tasks/require_collab_test_2_items/5_agent.json", 5)
#

test_items = ["bread", "golden_apple", "rabbit_stew", "cake", "baked_potato", "cooked_beef"]
# block_recipe_in_tasks("mindcraft/tasks/cooking_tasks/require_collab_test_2_items/2_agent.json", "mindcraft/tasks/cooking_tasks/require_collab_test_2_items/2_agent_block_recipe.json", 2)
# make_all_possible_tasks(test_items, 2, 2, "mindcraft/tasks/cooking_tasks/require_collab_test_2_items/2_agent_blocked_action_remaining.json")

reconfigure_tasks("mindcraft/tasks/cooking_tasks/require_collab_test_2_items/2_agent_hells_kitchen_full.json", "mindcraft/tasks/cooking_tasks/require_collab_test_2_items/2_agent_hells_kitchen_full_inventory.json", 2)

# reconfigure_tasks("mindcraft/tasks/cooking_tasks/test_tasks/test_tasks.json", "mindcraft/tasks/cooking_tasks/require_collab_test_2_items/2_agent_block_recipe.json", 2)
# reconfigure_tasks("mindcraft/tasks/cooking_tasks/test_tasks/hells_kitchen_test_tasks.json", "mindcraft/tasks/cooking_tasks/require_collab_test_2_items/2_agent_hells_kitchen.json", 2, True)
# reconfigure_tasks("mindcraft/tasks/cooking_tasks/train_tasks/train_tasks.json", "mindcraft/tasks/cooking_tasks/require_collab_train_2_items/2_agent_block_recipe.json", 2, False)
# reconfigure_tasks("mindcraft/tasks/cooking_tasks/train_tasks/hells_kitchen_train_tasks.json", "mindcraft/tasks/cooking_tasks/require_collab_train_2_items/2_agent_hells_kitchen.json", 2, True)

# reconfigure_tasks("mindcraft/tasks/cooking_tasks/train_tasks/2_agent_cooking_train_tasks.json", "mindcraft/tasks/cooking_tasks/require_collab_train_2_items/3_agent.json", 3)
# reconfigure_tasks("mindcraft/tasks/cooking_tasks/train_tasks/2_agent_cooking_train_tasks.json", "mindcraft/tasks/cooking_tasks/require_collab_train_2_items/4_agent.json", 4)
# reconfigure_tasks("mindcraft/tasks/cooking_tasks/train_tasks/2_agent_cooking_train_tasks.json", "mindcraft/tasks/cooking_tasks/require_collab_train_2_items/5_agent.json", 5)
# reconfigure_tasks("mindcraft/tasks/cooking_tasks/equal_load_test_tasks/3_agent.json", "mindcraft/tasks/cooking_tasks/require_collab_test/3_agent.json")
# reconfigure_tasks("mindcraft/tasks/cooking_tasks/equal_load_test_tasks/4_agent.json", "mindcraft/tasks/cooking_tasks/require_collab_test/4_agent.json")
# reconfigure_tasks("mindcraft/tasks/cooking_tasks/equal_load_test_tasks/5_agent.json", "mindcraft/tasks/cooking_tasks/require_collab_test/5_agent.json")

# reconfigure_tasks("mindcraft/tasks/cooking_tasks/train_tasks/2_agent_cooking_train_tasks.json", "mindcraft/tasks/cooking_tasks/require_collab_train/2_agent.json")
# reconfigure_tasks("mindcraft/tasks/cooking_tasks/train_tasks/train_tasks.json", "mindcraft/tasks/cooking_tasks/require_collab_train/2_agent_blocked_access.json")
# reconfigure_tasks("mindcraft/tasks/cooking_tasks/train_tasks/train_tasks_3_agents.json", "mindcraft/tasks/cooking_tasks/require_collab_train/3_agent.json")
# reconfigure_tasks("mindcraft/tasks/cooking_tasks/train_tasks/train_tasks_4_agents.json", "mindcraft/tasks/cooking_tasks/require_collab_train/4_agent.json")
# reconfigure_tasks("mindcraft/tasks/cooking_tasks/train_tasks/train_tasks_5_agents.json", "mindcraft/tasks/cooking_tasks/require_collab_train/5_agent.json")