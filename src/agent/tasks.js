import { readFileSync } from 'fs';
import { executeCommand } from './commands/index.js';
import { getPosition } from './library/world.js';
import settings from '../../settings.js';
import { Vec3 } from 'vec3';
import { ConstructionTaskValidator, Blueprint } from './task_types/construction_tasks.js';
import { CookingTaskInitiator } from './task_types/cooking_tasks.js';

//todo: modify validator code to return an object with valid and score -> do more testing hahah
//todo: figure out how to log these things to the same place as bots/histories
// export class CraftTaskValidator {
//     constructor(data, agent) {
//         this.target = data.target;
//         this.number_of_target = data.number_of_target;
//         this.agent = agent;


/**
 * Validates the presence of required items in an agent's inventory
 * @param {Object} data - Task data containing target and quantity information
 * @param {Object} agent - Agent object with bot inventory
 * @returns {Object} Validation result with success status and missing items
 */
function checkItemPresence(data, agent) {
    // Helper function to check if target is a dictionary with quantities
    function isTargetDictionaryWithQuantities(target) {
        return typeof target === 'object' && 
               !Array.isArray(target) && 

               target !== null &&
               Object.values(target).every(value => typeof value === 'number');
    }

    // Convert any target format into a standardized dictionary
    function normalizeTargets(target) {
        if (typeof target === 'string') {
            // Single target case
            return { [target]: 1 };
        } else if (Array.isArray(target)) {
            // Array case - convert to dictionary with default quantity 1
            return target.reduce((acc, item) => {
                acc[item] = 1;
                return acc;
            }, {});
        } else if (typeof target === 'object' && target !== null) {
            // Already a dictionary - return as is
            return target;
        }
        throw new Error('Invalid target format');
    }

    // Normalize quantities to match target format
    function normalizeQuantities(targets, quantities) {
        if (quantities === undefined) {
            // If no quantities specified, default to 1 for each target
            return Object.keys(targets).reduce((acc, key) => {
                acc[key] = 1;
                return acc;
            }, {});
        } else if (typeof quantities === 'number') {
            // If single number provided, apply to all targets
            return Object.keys(targets).reduce((acc, key) => {
                acc[key] = quantities;
                return acc;
            }, {});
        } else if (typeof quantities === 'object' && quantities !== null) {
            // If quantities dictionary provided, use it directly
            return quantities;
        }
        throw new Error('Invalid number_of_target format');
    }

    try {
        // First normalize targets to always have a consistent format
        const targets = normalizeTargets(data.target);
        
        // Determine the required quantities
        const requiredQuantities = isTargetDictionaryWithQuantities(data.target) 
            ? data.target 
            : normalizeQuantities(targets, data.number_of_target);

        // Count items in inventory
        const inventoryCount = {};
        agent.bot.inventory.slots.forEach((slot) => {
            if (slot) {
                const itemName = slot.name.toLowerCase();
                inventoryCount[itemName] = (inventoryCount[itemName] || 0) + slot.count;
            }
        });

        // Check if all required items are present in sufficient quantities
        const missingItems = [];
        let allTargetsMet = true;

        for (const [item, requiredCount] of Object.entries(requiredQuantities)) {
            const itemName = item.toLowerCase();
            const currentCount = inventoryCount[itemName] || 0;
            if (currentCount < requiredCount) {
                allTargetsMet = false;
                missingItems.push({
                    item: itemName,
                    required: requiredCount,
                    current: currentCount,
                    missing: requiredCount - currentCount
                });
            }
        }

        return {
            success: allTargetsMet,
            missingItems: missingItems
        };

    } catch (error) {
        console.error('Error checking item presence:', error);
        return {
            success: false,
            missingItems: [],
            error: error.message
        };
    }
}

class CookingCraftingTaskValidator {
    constructor(data, agent) {
        this.data = data;
        this.agent = agent;
    } 
    validate() {
        const result = checkItemPresence(this.data, this.agent);
        let score = 0;
        if (result.success) {
            score = 1;
        }
        return {
            "valid": result.success, 
            "score": score,
        };
    }
}

export class Task {
    constructor(agent, task_path, task_id, taskStartTime = null) {
        this.agent = agent;
        this.data = null;
        console.log("task start time", taskStartTime);
        if (taskStartTime !== null)
            this.taskStartTime = taskStartTime;
        else
            this.taskStartTime = Date.now();

        console.log(this.taskStartTime);
        this.validator = null;
        this.reset_function = null;
        this.blocked_actions = [];
        this.task_id = task_id;
        console.log('Task ID:', task_id);
        if (task_path && task_id) {
            this.data = this.loadTask(task_path, task_id);
            this.task_type = this.data.type;
            if (this.task_type === 'construction' && this.data.blueprint) {
                this.blueprint = new Blueprint(this.data.blueprint);
                this.goal = this.data.goal + ' \n' + this.blueprint.explain() + " \n" + "make sure to place the lower levels of the blueprint first";
                this.conversation = this.data.conversation + ' \n' + this.blueprint.explain();
            } else {
                this.goal = this.data.goal;
                this.conversation = this.data.conversation;
            }
            this.taskTimeout = this.data.timeout || 300;
            this.taskStartTime = Date.now();
            // Set validator based on task_type

            if (this.task_type === 'construction') {
                this.validator = new ConstructionTaskValidator(this.data, this.agent);
            } else if (this.task_type === 'cooking' || this.task_type === 'techtree') {
                this.validator = new CookingCraftingTaskValidator(this.data, this.agent);

            } else {
                this.validator = null;
            }

            if (this.data.blocked_actions) {
                this.blocked_actions = this.data.blocked_actions[this.agent.count_id.toString()] || [];
            } else {
                this.blocked_actions = [];
            }
            this.restrict_to_inventory = !!this.data.restrict_to_inventory;
            if (this.data.goal)
                this.blocked_actions.push('!endGoal');
            if (this.conversation)
                this.blocked_actions.push('!endConversation');
        }

        this.name = this.agent.name;
        this.available_agents = settings.profiles.map((p) => JSON.parse(readFileSync(p, 'utf8')).name);
    }

    getAgentGoal() {
        if (!this.data || !this.data.goal) {
            return null;
        }

        let add_string = '';

        if (this.task_type === 'cooking') {
            add_string = '\nIn the end, all the food items should be given to one single bot.';
        }

        // If goal is a string, all agents share the same goal
        if (typeof this.data.goal === 'string') {
            return this.data.goal + add_string;
        }

        // If goal is an object, get the goal for this agent's count_id
        if (typeof this.data.goal === 'object' && this.data.goal !== null) {
            const agentId = this.agent.count_id.toString();
            return (this.data.goal[agentId] || '') + add_string;
        }

        return null;
    }

    loadTask(task_path, task_id) {
        try {
            const tasksFile = readFileSync(task_path, 'utf8');
            const tasks = JSON.parse(tasksFile);
            let task = tasks[task_id];
            console.log(task);
            console.log(this.agent.count_id);
            if (!task) {
                throw new Error(`Task ${task_id} not found`);
            }
            // if ((!task.agent_count || task.agent_count <= 1) && this.agent.count_id > 0) {
            //     task = null;
            // }

            return task;
        } catch (error) {
            console.error('Error loading task:', error);
            process.exit(1);
        }
    }

    isDone() {
        let res = null;
        if (this.validator)
            res = this.validator.validate();
        if (res && res.valid) {
            // Find all the agents and clear their inventories
            for (let agent of this.available_agents) {
                this.agent.bot.chat(`/clear ${agent}`);
            }
            return {"message": 'Task successful', "score": res.score};
        }
        let other_names = this.available_agents.filter(n => n !== this.name);
        const elapsedTime = (Date.now() - this.taskStartTime) / 1000;

        if (elapsedTime >= 30 && this.available_agents.length !== this.data.agent_count) {
            console.log('No other agents found. Task unsuccessful.');
            return {"message": 'No other agents found', "score": 0};
        }
        
        if (this.taskTimeout) {
            if (elapsedTime >= this.taskTimeout) {
                console.log('Task timeout reached. Task unsuccessful.');
                if (res) {
                    return {"message": 'Task timeout reached', "score": res.score};
                } else {
                    return {"message": 'Task timeout reached', "score": 0};
                }
                
            }
        }
        return false;
    }

    async initBotTask() {
        await this.agent.bot.chat(`/clear ${this.name}`);
        console.log(`Cleared ${this.name}'s inventory.`);

        //wait for a bit so inventory is cleared
        await new Promise((resolve) => setTimeout(resolve, 500));

        if (this.data === null)
            return;
        
        if (this.task_type === 'cooking') {
            this.initiator = new CookingTaskInitiator(this.data, this.agent);
        } else {
            this.initiator = null;
        }
        await this.teleportBots();

        //wait for a bit so bots are teleported
        await new Promise((resolve) => setTimeout(resolve, 3000));

        if (this.data.initial_inventory) {
            console.log("Setting inventory...");
            let initialInventory = {};
            
            // Handle multi-agent inventory assignment
            if (this.data.agent_count > 1) {
                initialInventory = this.data.initial_inventory[this.agent.count_id.toString()] || {};
                console.log("Initial inventory for agent", this.agent.count_id, ":", initialInventory);
            } else {
                initialInventory = this.data.initial_inventory;
                console.log("Initial inventory:", initialInventory);
            }
            console.log(this.data.initial_inventory);

            // Assign inventory items
            for (let key of Object.keys(initialInventory)) {
                const itemName = key.toLowerCase();
                const quantity = initialInventory[key];
                await this.agent.bot.chat(`/give ${this.name} ${itemName} ${quantity}`);
                console.log(`Gave ${this.name} ${quantity} ${itemName}`);
            }

            // Wait briefly for inventory commands to complete
            await new Promise((resolve) => setTimeout(resolve, 500));
        }

        if (this.initiator) {
            await this.initiator.init();
        }

        if (this.data.agent_count && this.data.agent_count > 1) {
            // TODO wait for other bots to join
            await new Promise((resolve) => setTimeout(resolve, 10000));
            if (this.available_agents.length < this.data.agent_count) {
                console.log(`Missing ${this.data.agent_count - this.available_agents.length} bot(s).`);
                this.agent.killAll();
            }
        }

        if (this.data.conversation && this.agent.count_id === 0) {
            let other_name = this.available_agents.filter(n => n !== this.name)[0];
            let waitCount = 0;
            while (other_name === undefined && waitCount < 20) {
                other_name = this.available_agents.filter(n => n !== this.name)[0];
                await new Promise((resolve) => setTimeout(resolve, 1000));
                waitCount++;
            }
            if (other_name === undefined) {
                console.log('No other agents found. Task unsuccessful.');
                this.agent.killAll();
            }
            await executeCommand(this.agent, `!startConversation("${other_name}", "${this.data.conversation}")`);
        }

        let agentGoal = this.getAgentGoal();
        if (agentGoal) {
            agentGoal += "You have to collaborate with other agents/bots, namely " + this.available_agents.filter(n => n !== this.name).join(', ') + " to complete the task as soon as possible by dividing the work among yourselves.";
            console.log(`Setting goal for agent ${this.agent.count_id}: ${agentGoal}`);
            await executeCommand(this.agent, `!goal("${agentGoal}")`);
        }
    }
    
    async teleportBots() {
        console.log('\n\nTeleporting bots');
        function getRandomOffset(range) {
            return Math.floor(Math.random() * (range * 2 + 1)) - range;
        }

        let human_player_name = null;
        let bot = this.agent.bot;

        // Finding if there is a human player on the server
        for (const playerName in bot.players) {
            const player = bot.players[playerName];
            if (!this.available_agents.some((n) => n === playerName)) {
                console.log('Found human player:', player.username);
                human_player_name = player.username
                break;
            }
        }

        if (human_player_name) {
            console.log(`Teleporting ${this.name} to human ${human_player_name}`)
            bot.chat(`/tp ${this.name} ${human_player_name}`)
        }
        await new Promise((resolve) => setTimeout(resolve, 200));

        // now all bots are teleport on top of each other (which kinda looks ugly)
        // Thus, we need to teleport them to random distances to make it look better

        /*
        Note : We don't want randomness for construction task as the reference point matters a lot.
        Another reason for no randomness for construction task is because, often times the user would fly in the air,
        then set a random block to dirt and teleport the bot to stand on that block for starting the construction,
        This was done by MaxRobinson in one of the youtube videos.
        */


        if (this.data.type !== 'construction') {
            const pos = getPosition(bot);
            const xOffset = getRandomOffset(5);
            const zOffset = getRandomOffset(5);
            bot.chat(`/tp ${this.name} ${Math.floor(pos.x + xOffset)} ${pos.y + 3} ${Math.floor(pos.z + zOffset)}`);
            await new Promise((resolve) => setTimeout(resolve, 200));
        }

        if (this.data.agent_count && this.data.agent_count > 1) {
            // TODO wait for other bots to join
            await new Promise((resolve) => setTimeout(resolve, 10000));
            if (this.available_agents.length < this.data.agent_count) {
                console.log(`Missing ${this.data.agent_count - this.available_agents.length} bot(s).`);
                this.agent.killAll();
            }
        }

        if (this.data.type === 'construction'){
            //Ensures construction is cleaned out first. -> relies on cheats which are turned off?
            if (this.blueprint){
                const result = this.blueprint.autoDelete();
                const commands = result.commands;
                const nearbyPosition = result.nearbyPosition;
                console.log("nearby position", nearbyPosition);
                bot.chat(`/tp ${this.name} ${nearbyPosition.x} ${nearbyPosition.y} ${nearbyPosition.z}`);
                for (const command of commands) {
                    bot.chat(command);
                }
            }
            else{
                console.log('no construction blueprint?')
            }
        }
    }
}