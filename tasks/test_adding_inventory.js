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


async function main() {
    try {
        let bot = createBot({
            username: 'andy',
    
            host: settings.host,
            port: settings.port,
            auth: settings.auth,
    
            version: settings.minecraft_version,
        });
        const tasks = ['techtree_1_shears_with_2_iron_ingot']

        bot.once("spawn", function() {
            console.log('Bot spawned');
            for (let taskId of tasks) {
                console.log(`Starting task ${taskId}`);
                var task = loadTask(taskId);
                var validator = new TechTreeHarvestValidator(task, bot);
                bot.chat(`/clear @p`);
                console.log("Inventory cleared!");
                console.log(Object.keys(task.initial_inventory));
                // check that inventory has been cleared 
                
                for (let key of Object.keys(task.initial_inventory)) {
                    console.log('Giving item:', key);
                    bot.chat(`/give @p ${key} ${task.initial_inventory[key]}`);
                }
                // const success = validator.validate();
                // console.log(`Task ${taskId} complete and is ${success}`);
                // console.log('Chat commands sent');
                // const success = validator.validate();
                // console.log(`Task ${taskId} complete and is ${success}`);
            }
        });
    } catch (error) {
        console.error(error);
    }
}

main();