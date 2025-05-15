import mineflayer from 'mineflayer';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { Blueprint, ConstructionTaskValidator } from '../src/agent/tasks/construction_tasks.js';
import { CookingTaskInitiator } from '../src/agent/tasks/cooking_tasks.js';

import fs from 'fs';
import { start } from 'repl';

// add a mineflayer bot the world named Andy 
const bot = mineflayer.createBot({
    host: 'localhost', // Replace with your server IP or hostname
    port: 55916,       // Replace with your server port
    username: 'andy', // Replace with your bot's username
    // password: 'your_bot_password' // Only if the server has online-mode=true
});

function parseArguments() {
    return yargs(hideBin(process.argv))
        .option('usernames', {
            type: 'array',
            describe: 'List of usernames to give items to',
        })
        .option('task_path', {
            type: 'string',
            describe: 'Path to task file to execute'
        })
        .option('task_id', {
            type: 'string',
            describe: 'Task ID to execute'
        })
        .help()
        .alias('help', 'h')
        .parse();
}

class Agent {
    constructor(bot) {
        this.bot = bot;
    }
}

// parse arguments
const args = parseArguments();
console.log(args);

// load in the task path
const taskPath = fs.readFileSync(args.task_path, 'utf8');
const taskData = JSON.parse(taskPath);
const task_id = args.task_id;

// give the required inventory items to the usernames specified in the usernames list
bot.on('spawn', async () => {
    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log("Bot spawned. Starting task...");
    

    // initiate the world according to the construction or cooking world
    const usernames = args.usernames;
    console.log(usernames);
    bot.chat(`/tp andy ${usernames[0]}`);
    await new Promise(resolve => setTimeout(resolve, 5000));
    // console.log(taskData);
    console.log(`Task id is ${task_id}`)
    console.log(task_id);
    const task = taskData[task_id];
    console.log(task);

    // give the items to the users
    for (let i = 0; i < usernames.length; i++) {
        const user = usernames[i];
        bot.chat(`/clear ${user}`);
        let userInventory = null;
        if (task.initial_inventory) {
            userInventory = task.initial_inventory[i];
        }

        if (userInventory) {
            for (const item in userInventory) {
                const count = userInventory[item];
                bot.chat(`/give ${user} ${item} ${count}`);
            }
        } else {
            console.log(`No inventory found for user: ${user}`);
        }
        let validator = null;

        if (task.type === "techtree" ) {
            bot.chat(`/tell ${user} You have the goal to ${task.goal}`);
        }

        if (task.type === "construction") {
            console.log(task.blueprint);
            const blueprint = new Blueprint(task.blueprint);
            console.log(blueprint);
            const result = blueprint.autoDelete();
            const commands = result.commands;
            // for (const command of commands) {
            //     bot.chat(command);
            // }
            // bot.chat(`/tp @a ${task.blueprint.levels[0].coordinates[0]} ${task.blueprint.levels[0].coordinates[1]} ${task.blueprint.levels[0].coordinates[2]}`);
            // bot.chat(`/tell ${user} You have the goal to ${task.goal}`);
            //todo: some sort of blueprint visualizer
        }
        if (task.type === "cooking") {
            if (i === 0) {
                const cooking_initiator = new CookingTaskInitiator(task, bot);
                cooking_initiator.init();
                console.log("Cooking task initiated");
            }
            await new Promise(resolve => setTimeout(resolve, 20000));
            const user_goal = task.goal[i];
            bot.chat(`You have the goal to ${user_goal}`);
        }
    }

    const timeout = task.timeout;
    console.log(`Timeout set to ${timeout} seconds`);
    // await new Promise(resolve => setTimeout(resolve, timeout * 1000));
    if (task.type === "construction") {
        const blueprint = new Blueprint(task.blueprint);
        const check = blueprint.explainBlueprintDifference(bot);
        console.log(check);
        const agent = new Agent(bot);
        const validator = new ConstructionTaskValidator(task, agent);
        const result = validator.validate();
        console.log(result);
        bot.chat(`Score is ${result.score}`);
    }
    bot.chat(`Time is up!`);
});
// give required information to the users in some way
// do some automatic timer sort of thing to give the users time to do the task
