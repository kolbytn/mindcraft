import { readFileSync } from 'fs';
import { executeCommand } from './commands/index.js';
import { getPosition } from './library/world.js'
import settings from '../../settings.js';


export class TaskValidator {
    constructor(data, agent) {
        this.target = data.target;
        this.number_of_target = data.number_of_target;
        this.agent = agent;
    }

    validate() {
        try{
            let valid = false;
            let total_targets = 0;
            this.agent.bot.inventory.slots.forEach((slot) => {
                if (slot && slot.name.toLowerCase() === this.target) {
                    total_targets += slot.count;
                }
                if (slot && slot.name.toLowerCase() === this.target && slot.count >= this.number_of_target) {
                    valid = true;
                    console.log('Task is complete');
                }
            });
            if (total_targets >= this.number_of_target) {
                valid = true;
                console.log('Task is complete');
            }
            return valid;
        } catch (error) {
            console.error('Error validating task:', error);
            return false;
        }
    }
}

export class Task {
    constructor(agent, task_path, task_id) {
        this.agent = agent;
        this.data = null;
        this.taskTimeout = 300;
        this.taskStartTime = Date.now();
        this.validator = null;
        this.blocked_actions = [];
        if (task_path && task_id) {
            this.data = this.loadTask(task_path, task_id);
            this.taskTimeout = this.data.timeout || 300;
            this.taskStartTime = Date.now();
            this.validator = new TaskValidator(this.data, this.agent);
            if (this.data.blocked_actions) {
                this.blocked_actions = this.data.blocked_actions[this.agent.count_id.toString()] || [];
            } else {
                this.blocked_actions = [];
            }
            this.restrict_to_inventory = !!this.data.restrict_to_inventory;
            if (this.data.goal)
                this.blocked_actions.push('!endGoal');
            if (this.data.conversation)
                this.blocked_actions.push('!endConversation');
        }
    }

    loadTask(task_path, task_id) {
        try {
            const tasksFile = readFileSync(task_path, 'utf8');
            const tasks = JSON.parse(tasksFile);
            const task = tasks[task_id];
            if (!task) {
                throw new Error(`Task ${task_id} not found`);
            }
            if ((!task.agent_count || task.agent_count <= 1) && this.agent.count_id > 0) {
                task = null;
            }

            return task;
        } catch (error) {
            console.error('Error loading task:', error);
            process.exit(1);
        }
    }

    isDone() {
        if (this.validator && this.validator.validate())
            return {"message": 'Task successful', "code": 2};
        if (this.taskTimeout) {
            const elapsedTime = (Date.now() - this.taskStartTime) / 1000;
            if (elapsedTime >= this.taskTimeout) {
                console.log('Task timeout reached. Task unsuccessful.');
                return {"message": 'Task timeout reached', "code": 4};
            }
        }
        return false;
    }

    async initBotTask() {
        if (this.data === null)
            return;
        let bot = this.agent.bot;
        let name = this.agent.name;

        bot.chat(`/clear ${name}`);
        console.log(`Cleared ${name}'s inventory.`);

        //kill all drops
        if (this.agent.count_id === 0) {
            bot.chat(`/kill @e[type=item]`);
        }
        //wait for a bit so inventory is cleared
        await new Promise((resolve) => setTimeout(resolve, 500));
        let initial_inventory = null;
        if (this.data.agent_count > 1) {
            initial_inventory = this.data.initial_inventory[this.agent.count_id.toString()];
            console.log("Initial inventory:", initial_inventory);
        } else if (this.data) {
            console.log("Initial inventory:", this.data.initial_inventory);
            initial_inventory = this.data.initial_inventory;
        }
    
        if ("initial_inventory" in this.data) {
            console.log("Setting inventory...");
            console.log("Inventory to set:", initial_inventory);
            for (let key of Object.keys(initial_inventory)) {
                console.log('Giving item:', key);
                bot.chat(`/give ${name} ${key} ${initial_inventory[key]}`);
            };
            //wait for a bit so inventory is set
            await new Promise((resolve) => setTimeout(resolve, 500));
            console.log("Done giving inventory items.");
        }
        // Function to generate random numbers
    
        function getRandomOffset(range) {
            return Math.floor(Math.random() * (range * 2 + 1)) - range;
        }
    
        let human_player_name = null;
        let available_agents = settings.profiles.map((p) => JSON.parse(readFileSync(p, 'utf8')).name);  // TODO this does not work with command line args
    
        // Finding if there is a human player on the server
        for (const playerName in bot.players) {
            const player = bot.players[playerName];
            if (!available_agents.some((n) => n === playerName)) {
                console.log('Found human player:', player.username);
                human_player_name = player.username
                break;
            }
        }

        // If there are multiple human players, teleport to the first one
    
        // teleport near a human player if found by default
    
        if (human_player_name) {
            console.log(`Teleporting ${name} to human ${human_player_name}`)
            bot.chat(`/tp ${name} ${human_player_name}`) // teleport on top of the human player
    
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
            bot.chat(`/tp ${name} ${Math.floor(pos.x + xOffset)} ${pos.y + 3} ${Math.floor(pos.z + zOffset)}`);
            await new Promise((resolve) => setTimeout(resolve, 200));
        }

        if (this.data.agent_count && this.data.agent_count > 1) {
            // TODO wait for other bots to join
            await new Promise((resolve) => setTimeout(resolve, 10000));
            if (available_agents.length < this.data.agent_count) {
                console.log(`Missing ${this.data.agent_count - available_agents.length} bot(s).`);
                this.agent.killAll();
            }
        }

        if (this.data.goal) {
            await executeCommand(this.agent, `!goal("${this.data.goal}")`);
        }
    
        if (this.data.conversation && this.agent.count_id === 0) {
            let other_name = available_agents.filter(n => n !== name)[0];
            await executeCommand(this.agent, `!startConversation("${other_name}", "${this.data.conversation}")`);
        }
    }    
}
