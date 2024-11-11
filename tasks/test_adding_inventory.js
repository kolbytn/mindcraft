import { loadTask } from '../src/utils/tasks.js';
import { TechTreeHarvestValidator } from '../tasks/validation_functions/task_validator.js';
import { createBot } from 'mineflayer';
import settings from '../settings.js';
import yaml from 'js-yaml'
import { readFileSync } from 'fs';
import { start } from 'repl';

function tasksFromFile(taskType) {
    const tasksFile = readFileSync(`tasks/${taskType}_tasks.yaml`, 'utf8');
    const tasks = yaml.load(tasksFile);
    console.log(tasks);
    const taskIds = Object.keys(tasks);
    // console.log(Object.keys(tasks).map(key => `${key}`));
    const slicedTaskIds = taskIds.slice(0, 2);
    console.log(slicedTaskIds);
    return slicedTaskIds;
}

function addInventory(taskId, username) {
    let bot = createBot({
        username: username,

        host: settings.host,
        port: settings.port,
        auth: settings.auth,

        version: settings.minecraft_version,
    });

    bot.once("spawn", function() {
        const tasks = ['techtree_1_shears_with_2_iron_ingot']
        var task = loadTask(taskId);
        bot.chat(`/clear ${username}`);
        console.log("Inventory cleared!");
        console.log(Object.keys(task.initial_inventory));
        // check that inventory has been cleared 

        for (let key of Object.keys(task.initial_inventory)) {
            console.log('Giving item:', key);
            bot.chat(`/give ${username} ${key} ${task.initial_inventory[key]}`);
        }
    });
    return bot;

}

async function main() {
    try {
        const taskId = 'techtree_1_shears_with_2_iron_ingot';
        var andy = addInventory(taskId, 'andy');
        var randy = addInventory(taskId, 'randy');

        await new Promise((resolve) => setTimeout(resolve, 10000));
        andy.chat(`/kick randy`);
    } catch (error) {
        console.error(error);
    }
}

main();