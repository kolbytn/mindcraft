# Construction Tasks Generation

## Overview
Instructions on how to customize construction task generation.

## Getting Started
Edit and Run `tasks/construction_tasks/generate_multiagent_construction_tasks.js` to create new task variants. Note the 'main' is at the end of the page, and determines which file gets written to. 

## Customization Options

### Cheats and Profile Configurations
To enable cheats, set the `cheat` variable to `true` in `profiles/task_construct.json`. 
You can additionally access 

### Task Configuration
For task specific customization, modify the `generateConstructionTasks` function in `tasks/construction_tasks/generate_multiagent_construction_tasks.js` to adjust:

1. Room parameters:
    - Size
    - Window style
    - Carpet style

2. Task generation:
    - Number of variants
    - Timeout duration

The generation code is documented to help with customization.

## Important File Locations
- `tasks/construction_tasks/generate_multiagent_construction_tasks.js` - Main task generation script
- `profiles/task_construct.json` - Default configuration profile
- `tasks/construction_tasks/test_multiagent_construction_tasks.json` - Training task definitions (initalized with 5 variants)
- `tasks/construction_tasks/test_multiagent_construction_tasks.json` - Test task definitions (initalized with 1 variant)
- `src/agent/tasks/construction_tasks.js` - Blueprint Class, Construction Validation Class, and Procedural Generation Function