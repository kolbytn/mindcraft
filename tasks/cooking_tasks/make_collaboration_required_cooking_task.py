import random
import json
from typing import Dict, List, Any, Tuple, Set
from collections import Counter, defaultdict
import os

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
        "coal": 8,
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
        "coal": 8,
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
        "coal": 8,
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
        "coal": 8,
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
        "coal": 8,
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
        "coal": 8,
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

def reconfigure_tasks(task_path, new_task_path, num_agents=None):
    with open(task_path, 'r') as f:
        tasks = json.load(f)
    task_ids = tasks.keys()
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
            print(inventory)
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
                agent_num = i % num_agents
                if inventory[items_lst[i]] == 1:
                    initial_inventory[agent_num][items_lst[i]] = 1
                elif inventory[items_lst[i]] > 1:
                    num_per_agent = inventory[items_lst[i]] // num_agents + 1
                    for j in range(num_agents):
                        initial_inventory[j][items_lst[i]] = num_per_agent
                # initial_inventory[agent_num][items_lst[i]] = inventory[items_lst[i]]
            task["initial_inventory"] = initial_inventory
            
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
                # check each of the recipes and replace with the new recipe

    os.makedirs(os.path.dirname(new_task_path), exist_ok=True)
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
reconfigure_tasks("mindcraft/tasks/cooking_tasks/test_tasks/2_agent_cooking_test_tasks.json", "mindcraft/tasks/cooking_tasks/require_collab_test_2_items/2_agent.json", 2)

# reconfigure_tasks("mindcraft/tasks/cooking_tasks/equal_load_test_tasks/3_agent.json", "mindcraft/tasks/cooking_tasks/require_collab_test/3_agent.json")
# reconfigure_tasks("mindcraft/tasks/cooking_tasks/equal_load_test_tasks/4_agent.json", "mindcraft/tasks/cooking_tasks/require_collab_test/4_agent.json")
# reconfigure_tasks("mindcraft/tasks/cooking_tasks/equal_load_test_tasks/5_agent.json", "mindcraft/tasks/cooking_tasks/require_collab_test/5_agent.json")

# reconfigure_tasks("mindcraft/tasks/cooking_tasks/train_tasks/2_agent_cooking_train_tasks.json", "mindcraft/tasks/cooking_tasks/require_collab_train/2_agent.json")
# reconfigure_tasks("mindcraft/tasks/cooking_tasks/train_tasks/train_tasks.json", "mindcraft/tasks/cooking_tasks/require_collab_train/2_agent_blocked_access.json")
# reconfigure_tasks("mindcraft/tasks/cooking_tasks/train_tasks/train_tasks_3_agents.json", "mindcraft/tasks/cooking_tasks/require_collab_train/3_agent.json")
# reconfigure_tasks("mindcraft/tasks/cooking_tasks/train_tasks/train_tasks_4_agents.json", "mindcraft/tasks/cooking_tasks/require_collab_train/4_agent.json")
# reconfigure_tasks("mindcraft/tasks/cooking_tasks/train_tasks/train_tasks_5_agents.json", "mindcraft/tasks/cooking_tasks/require_collab_train/5_agent.json")