import mineflayer from 'mineflayer';
import yargs from 'yargs';
import { resetConstructionWorld } from '../src/agent/tasks/construction_tasks.js';
import { cookingTaskInitalization } from '../src/agent/tasks/cooking_tasks.js';
import { worldToBlueprint, blueprintToTask } from '../../src/agent/tasks/construction_tasks.js';
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

// parse arguments
const args = parseArguments();

// load in the task path
const taskPath = fs.readFileSync(args.task_path, 'utf8');
const taskData = JSON.parse(taskPath);
const selectedTaskId = taskData.task_id;


// give the required inventory items to the usernames specified in the usernames list
bot.on('spawn', async () => {
    console.log("Bot spawned. Starting task...");

    // initiate the world according to the construction or cooking world
    const usernames = args.usernames;
    const task = taskData[selectedTaskId];
    const inventory = task.initial_inventory;

    // give the items to the users
    for (let i = 0; i < usernames.length; i++) {
        const user = usernames[i];
        const userInventory = inventory[i];

        if (userInventory) {
            for (const item in userInventory) {
                const count = userInventory[item];
                bot.chat(`/give ${user} ${item} ${count}`);
            }
        } else {
            console.log(`No inventory found for user: ${user}`);
        }

        if (task.type === "techtree" ) {
            bot.chat(`/tell ${user} You have the goal to ${task.goal}`);
        }

        if (task.type === "construction") {
            bot.chat(`/tell ${user} You have the goal to ${task.goal}`);
            //todo: some sort of blueprint visualizer
        }
        if (task.type === "cooking") {
            const user_goal = task.goal[i];
            bot.chat(`/tell ${user} You have the goal to ${user_goal}`);
        }
        
    }

    const timeout = task.timeout;
    // wait timeout seconds and then crash the task 
    setTimeout(() => {
        bot.chat(`/tell ${usernames} Time is up!`);
        bot.quit();
    }, timeout * 1000);
});
// give required information to the users in some way
// do some automatic timer sort of thing to give the users time to do the task
