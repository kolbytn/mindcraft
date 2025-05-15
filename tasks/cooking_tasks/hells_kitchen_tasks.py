import random
import json
from typing import Dict, List, Any, Tuple, Set
from collections import Counter, defaultdict
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
    "complexity": "medium", 
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
        "gold_ingots": 8,
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
    "required_chest_items": ["gold_ingots"]
},

}

chest_items = {
    "milk_bucket": 3,
    "egg": 16,
    "dandelion": 64,
    "cocao_beans": 64,
    "apple": 64,
    "gold_ingots": 8,
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


chest_items = [
                ['minecraft:milk_bucket', 1],     
                ['minecraft:egg', 16],            
                ['minecraft:dandelion', 64],    
                ['minecraft:sugar', 64],
                ['minecraft:cocoa_beans', 64],
                ['minecraft:apple', 64],
                ['minecraft:milk_bucket', 1],
                ['minecraft:milk_bucket', 1],
                ['minecraft:salmon', 64],
                ['minecraft:cod', 64],
                ['minecraft:kelp', 64],
                ['minecraft:dried_kelp', 64],
                ['minecraft:sweet_berries', 64],
                ['minecraft:honey_bottle', 1],
                ['minecraft:glow_berries', 64],
                ['minecraft:bowl', 64],
                ['minecraft:milk_bucket', 1],
                ['minecraft:milk_bucket', 1],
                ['minecraft:milk_bucket', 1],
                ['minecraft:milk_bucket', 1],
                ['minecraft:cooked_salmon', 64],
                ['minecraft:cooked_cod', 64],
                ['minecraft:gold_ingot', 64],
                ['minecraft:oak_planks', 64],
                ['minecraft:iron_ingot', 64],
                ['minecraft:milk_bucket', 1],
                ['minecraft:milk_bucket', 1],
            ]

def generate_task_id(task: Dict[str, Any]) -> str:
    """
    Generate a standardized task ID based on target items and blocked access.
    
    Format: multiagent_cooking_{quantities}_{blocked_info}
    Examples:
    - multiagent_cooking_1_cooked_rabbit
    - multiagent_cooking_1_cooked_rabbit_blocked_access_0
    - multiagent_cooking_1_cake_1_cookie_blocked_access_0_1
    
    Args:
        task: Task dictionary with target and blocked_access_to_recipe information
    
    Returns:
        Standardized task ID string
    """
    # Generate the quantities part (e.g., "1_cake_1_cookie")
    quantities = []
    for item, count in sorted(task["target"].items()):
        quantities.append(f"{count}_{item}")
    
    quantities_str = "_".join(quantities)
    
    # Generate the blocked access part if any (e.g., "blocked_access_0_1")
    blocked_str = ""
    if task["blocked_access_to_recipe"]:
        # Sort to ensure consistent ordering
        sorted_blocked = sorted(task["blocked_access_to_recipe"])
        blocked_str = f"_blocked_access_{'_'.join(sorted_blocked)}"
    
    # Combine everything
    return f"multiagent_cooking_{quantities_str}{blocked_str}"

def generate_hells_kitchen_task_id(task: Dict[str, Any]) -> str:
    """
    Generate a standardized task ID for Hell's Kitchen tasks.

    Format: multiagent_cooking_{quantities}_hells_kitchen
    Examples:
    - multiagent_cooking_cooked_mutton_cooked_beef_hells_kitchen

    Args:
        task: Task dictionary with target information

    Returns:
        Standardized task ID string
    """
    # Generate the quantities part (e.g., "cooked_mutton_cooked_beef")
    quantities = "_".join(task["target"])

    # Combine everything with hells_kitchen suffix
    return f"multiagent_cooking_{quantities}_hells_kitchen"

def generate_hells_kitchen_task(selected_items) -> Dict[str, Any]:
    """Generate a single Hell's Kitchen task where agents have recipes for each other's items."""
    # Select two different items
    # selected_items = random.sample(list(COOKING_ITEMS.keys()), 2)

    # Assign one item to each agent
    agent0_target = selected_items[0]
    agent1_target = selected_items[1]

    # Combined target for the overall task as a list
    combined_target = [agent0_target, agent1_target]

    # Get recipes for both items
    recipes = {}
    for item in selected_items:
        recipes[item] = COOKING_ITEMS[item]["recipe"]

    # Create different goal strings for each agent
    goals = {}

    # Agent 0 has the recipe for Agent 1's target item
    recipe_for_agent1 = "\n".join(recipes[selected_items[1]])
    goals["0"] = (
        f"You need to make {selected_items[0]}, but you don't have the recipe for it, your partner has it!\n\n"
        f"Your partner needs to make {selected_items[1]}. You have their recipe:\n"
        f"Recipe for {selected_items[1]}:\n{recipe_for_agent1}\n\n"
        f"You must communicate effectively to exchange recipe information and complete both dishes."
        f" Note: You can only guide your partner with recipe steps. You cannot help with ingredient collection or cooking."
    )

    # Agent 1 has the recipe for Agent 0's target item
    recipe_for_agent0 = "\n".join(recipes[selected_items[0]])
    goals["1"] = (
        f"You need to make {selected_items[1]}, but you don't have the recipe for it, your partner has it!\n\n"
        f"Your partner needs to make {selected_items[0]}. You have their recipe:\n"
        f"Recipe for {selected_items[0]}:\n{recipe_for_agent0}\n\n"
        f"You must communicate effectively to exchange recipe information and complete both dishes."
        f" Note: You can only guide your partner with recipe steps. You cannot help with ingredient collection or cooking."
    )

    # Create a Hell's Kitchen themed conversation starter
    conversation = (
        f"We need to make {selected_items[0]} and {selected_items[1]} together. You are supposed to make {selected_items[1]} and I am supposed to make {selected_items[0]}, "
        f"but I only have YOUR recipe and you only have access to MY recipe! Let's exchange information and get cooking!"
    )

    task_data = {
        "conversation": conversation,
        "agent_count": 2,
        "target": combined_target,
        "type": "cooking",
        "timeout": 300,
        "recipes": recipes,
        "blocked_access_to_recipe": [],  # No blocked access - it's just switched
        "goal": goals,
        "task_type": "cooking"  # Mark as Hell's Kitchen task
    }

    # Generate a Hell's Kitchen task ID
    task_id = generate_hells_kitchen_task_id(task_data)

    return {task_id: task_data}

def calculate_hells_kitchen_task_difficulty_metrics(task: Dict) -> Dict[str, Any]:
    """Calculate detailed difficulty metrics for a Hell's Kitchen task."""
    # Get all recipes
    recipes = task["recipes"]
    
    # Calculate recipe step metrics
    total_steps = sum(len(steps) for steps in recipes.values())
    max_steps_per_recipe = max(len(steps) for steps in recipes.values()) if recipes else 0
    
    # Get number of target items
    num_unique_items = len(task["target"])
    
    # Calculate overall difficulty score
    difficulty_score = 0
    
    # Add score based on total steps
    if total_steps <= 4:
        step_difficulty = 1  # Easy
    elif total_steps <= 8:
        step_difficulty = 2  # Medium
    else:
        step_difficulty = 3  # Hard
    
    difficulty_score += step_difficulty
    
    # Add score based on number of items
    item_difficulty = num_unique_items
    difficulty_score += item_difficulty
    
    # Hell's Kitchen tasks are inherently more difficult due to communication requirements
    # Add a communication difficulty factor
    difficulty_score += 1
    
    # Determine final difficulty category
    if difficulty_score <= 3:
        difficulty_category = "easy"
    elif difficulty_score <= 5:
        difficulty_category = "medium"
    else:
        difficulty_category = "hard"
    
    # Compile all metrics into a dictionary
    difficulty_metrics = {
        "total_recipe_steps": total_steps,
        "max_steps_per_recipe": max_steps_per_recipe,
        "unique_target_items": num_unique_items,
        "overall_difficulty_score": difficulty_score,
        "difficulty_category": difficulty_category
    }
    
    return difficulty_metrics

def generate_maximum_hells_kitchen_tasks(
    num_train_tasks: int,
    num_test_tasks: int
) -> Tuple[Dict[str, Dict], Dict[str, Dict]]:
    """
    Generate as many Hell's Kitchen tasks as specified, without balancing difficulty.
    
    Args:
        num_train_tasks: Exact number of training tasks to generate
        num_test_tasks: Exact number of test tasks to generate
        
    Returns:
        Tuple of (train_tasks, test_tasks)
    """
    # Get all available cooking items
    all_items = list(COOKING_ITEMS.keys())
    
    # Fixed test items as specified in your original code
    hk_test_items = {"cooked_beef", "baked_potato", "cake", "golden_apple", "rabbit_stew", "bread"}

    hk_train_items = set(all_items) - hk_test_items
    
    hk_test_lst = list(hk_test_items)
    train_possible_combinations = itertools.combinations(hk_train_items, 2)
    # test_possible_combinations = [["bread", "golden_apple"], ["golden_apple", "rabbit_stew"], ["bread", "cake"], 
    #                               ["baked_potato", "golden_apple"], ["baked_potato", "cake"], ["cooked_beef", "golden_apple"]]
    test_possible_combinations = itertools.combinations(hk_test_lst, 2)
    # Set fixed seed for consistent results
    random.seed(42)
    
    # Generate tasks for training set
    train_tasks = {}
    for combination in train_possible_combinations:
        task = generate_hells_kitchen_task(combination)
        task_id, task_data = list(task.items())[0]
        
        # Check if task uses valid items for train set
        task_items = set(task_data["target"])
        if task_items.issubset(hk_train_items):
            # Still calculate metrics for information but don't filter by them
            task_data["difficulty_metrics"] = calculate_hells_kitchen_task_difficulty_metrics(task_data)
            task_data["difficulty"] = task_data["difficulty_metrics"]["difficulty_category"]
            train_tasks[task_id] = task_data
    
    # Generate tasks for test set
    test_tasks = {}
    for combination in test_possible_combinations:
        task = generate_hells_kitchen_task(combination)
        task_id, task_data = list(task.items())[0]
        
        # Check if task uses valid items for test set
        task_items = set(task_data["target"])
        if task_items.issubset(hk_test_items):
            # Still calculate metrics for information but don't filter by them
            task_data["difficulty_metrics"] = calculate_hells_kitchen_task_difficulty_metrics(task_data)
            task_data["difficulty"] = task_data["difficulty_metrics"]["difficulty_category"]
            test_tasks[task_id] = task_data
    
    return train_tasks, test_tasks



def analyze_task_split(train_tasks, test_tasks):
    """Analyze and print statistics about the train/test split with detailed difficulty metrics."""
    # Count total tasks
    train_count = len(train_tasks)
    test_count = len(test_tasks)
    
    # Count difficulty distribution by category
    train_difficulty = Counter(task["difficulty"] for task in train_tasks.values())
    test_difficulty = Counter(task["difficulty"] for task in test_tasks.values())
    
    # Analyze quantitative difficulty metrics
    train_metrics = {
        "total_recipe_steps": [],
        "unique_target_items": [],
        "overall_difficulty_score": []
    }
    
    test_metrics = {
        "total_recipe_steps": [],
        "unique_target_items": [],
        "overall_difficulty_score": []
    }
    
    # Collect metrics from tasks
    for task in train_tasks.values():
        for metric in train_metrics:
            if metric in task["difficulty_metrics"]:
                train_metrics[metric].append(task["difficulty_metrics"][metric])
    
    for task in test_tasks.values():
        for metric in test_metrics:
            if metric in task["difficulty_metrics"]:
                test_metrics[metric].append(task["difficulty_metrics"][metric])
    
    # Calculate statistics for each metric
    train_stats = {}
    test_stats = {}
    
    for metric in train_metrics:
        values = train_metrics[metric]
        if values:
            train_stats[metric] = {
                "min": min(values),
                "max": max(values),
                "mean": sum(values) / len(values),
                "median": sorted(values)[len(values)//2]
            }
    
    for metric in test_metrics:
        values = test_metrics[metric]
        if values:
            test_stats[metric] = {
                "min": min(values),
                "max": max(values),
                "mean": sum(values) / len(values),
                "median": sorted(values)[len(values)//2]
            }
    
    # Get items in each set
    train_items = set()
    test_items = set()
    
    for task in train_tasks.values():
        train_items.update(task["target"])
    
    for task in test_tasks.values():
        test_items.update(task["target"])
    
    # Check for item overlap
    item_overlap = train_items.intersection(test_items)
    
    # Compile the results
    result = {
        "train_count": train_count,
        "test_count": test_count,
        "train_difficulty_categories": dict(train_difficulty),
        "test_difficulty_categories": dict(test_difficulty),
        "train_difficulty_metrics": train_stats,
        "test_difficulty_metrics": test_stats,
        "train_items": list(train_items),
        "test_items": list(test_items),
        "item_overlap": list(item_overlap),
        "is_valid_items_split": len(item_overlap) == 0
    }
    
    return result

# Example usage
if __name__ == "__main__":
    hk_train_tasks, hk_test_tasks = generate_maximum_hells_kitchen_tasks(
        num_train_tasks=90,
        num_test_tasks=30
    )
    
    # Save Hell's Kitchen tasks to separate files
    with open("hells_kitchen_train_tasks.json", "w") as f:
        json.dump(hk_train_tasks, f, indent=2)
    
    with open("mindcraft/tasks/cooking_tasks/require_collab_test_2_items/2_agent_hells_kitchen_full.json", "w") as f:
        json.dump(hk_test_tasks, f, indent=2)
    
    # Print counts
    print(f"Generated {len(hk_train_tasks)} training tasks")
    print(f"Generated {len(hk_test_tasks)} test tasks")
    
    # You can still analyze the distribution if interested
    hk_analysis = analyze_task_split(hk_train_tasks, hk_test_tasks)
    print("\nHell's Kitchen Tasks Analysis:")
    print(json.dumps(hk_analysis, indent=2))