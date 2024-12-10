import { readFileSync } from 'fs';
import { executeCommand } from '../agent/commands/index.js';
import { getPosition } from '../agent/library/world.js'
import settings from '../../settings.js';

export function loadTask(task_path, task_id) {
    try {
        const tasksFile = readFileSync(task_path, 'utf8');
        const tasks = JSON.parse(tasksFile);
        const task = tasks[task_id];
        if (!task) {
            throw new Error(`Task ${task_id} not found`);
        }

        return task;
    } catch (error) {
        console.error('Error loading task:', error);
        process.exit(1);
    }
}

export async function initBotTask(agent) {
    let bot = agent.bot;
    let task = agent.task;
    let name = bot.username;

    bot.chat(`/clear ${name}`);
    console.log(`Cleared ${name}'s inventory.`);
    
    //wait for a bit so inventory is cleared
    await new Promise((resolve) => setTimeout(resolve, 500));

    if (task.agent_number > 1) {
        var initial_inventory = task.initial_inventory[agent.count_id.toString()];
        console.log("Initial inventory:", initial_inventory);
    } else if (task) {
        console.log("Initial inventory:", task.initial_inventory);
        var initial_inventory = task.initial_inventory;
    }

    if ("initial_inventory" in task) {
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
    let available_agents = settings.profiles.map((p) => JSON.parse(readFileSync(p, 'utf8')).name);

    // Finding if there is a human player on the server
    for (const playerName in bot.players) {
        const player = bot.players[playerName];
        if (!available_agents.some((n) => n === name)) {
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

    if (task.type !== 'construction') {
        const pos = getPosition(bot);
        const xOffset = getRandomOffset(5);
        const zOffset = getRandomOffset(5);
        bot.chat(`/tp ${name} ${Math.floor(pos.x + xOffset)} ${pos.y + 3} ${Math.floor(pos.z + zOffset)}`);
        await new Promise((resolve) => setTimeout(resolve, 200));
    }

    if (task.agent_count && task.agent_count > 1) {
        await new Promise((resolve) => setTimeout(resolve, 10000));
        if (available_agents.length < task.agent_count) {
            console.log(`Missing ${task.agent_count - available_agents.length} bot(s).`);
            agent.cleanKill('Not all required players/bots are present in the world. Exiting.', 4);
        }

    }

    if (task.goal) {
        await executeCommand(agent, `!goal("${task.goal}")`);
    }

    if (task.conversation && agent.count_id === 0) {
        let other_name = available_agents.filter(n => n !== name)[0];
        await executeCommand(agent, `!startConversation("${other_name}", "${task.conversation}")`);
    }
}

export class TechTreeHarvestValidator {
    constructor(task, bot) {
        this.target = task.target;
        this.number_of_target = task.number_of_target;
        this.bot = bot;
    }

    validate() {
        try{
            let valid = false;
            let total_targets = 0;
            this.bot.inventory.slots.forEach((slot) => {
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
