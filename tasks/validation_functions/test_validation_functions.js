import { loadTask } from '../../src/utils/tasks.js';
import { TechTreeHarvestValidator } from '../../tasks/validation_functions/task_validator.js';
import { createBot } from 'mineflayer';
import settings from '../../settings.js';
import yaml from 'js-yaml'
import { readFileSync } from 'fs';
import { start } from 'repl';

async function startTask(taskId, bot) {
    console.log(`Starting task ${taskId}`);

    var task = loadTask(taskId);
    var validator = new TechTreeHarvestValidator(task, bot);
    
    // Now try to chat
    bot.chat(`/clear @p`);
    bot.chat(`/give @p ${task.target} ${task.number_of_target}`);

    const success = await validator.validate();
    if (validator.validate()) {
        console.log(`Task ${taskId} is valid`);
    } else {
        console.log(`Task ${taskId} is invalid`);
    }
    return success;
    
    // const success = bot.once('spawn', async function() {
    //     var task = loadTask(taskId);
    //     var validator = new TechTreeHarvestValidator(task, bot);
        
    //     // Now try to chat
    //     await bot.chat(`/clear @p`);
    //     await bot.chat(`/give @p ${task.target} ${task.number_of_target}`);

    //     const success = await validator.validate();
    //     if (validator.validate()) {
    //         console.log(`Task ${taskId} is valid`);
    //     } else {
    //         console.log(`Task ${taskId} is invalid`);
    //     }
    //     await bot.chat(`/kick @p`);
    //     return success;
    // });
    // bot.once('end', function() {
    //     console.log('Bot disconnected');
    //     return success;
    // });
    return success;
    
}

async function startTaskDebug(taskId) {
    console.log(`Starting task ${taskId}`);
    return true;
}


// Define the tasks array

async function tasksFromFile(taskType) {
    const tasksFile = readFileSync(`tasks/${taskType}_tasks.yaml`, 'utf8');
    const tasks = await yaml.load(tasksFile);
    const taskIds = await Promise.all(Object.keys(tasks));
    // console.log(Object.keys(tasks).map(key => `${key}`));
    const slicedTaskIds = taskIds.slice(1, 2);
    console.log(slicedTaskIds);
    return slicedTaskIds;
}
// const tasks = ["harvest_1_oak_log", "harvest_1_sand"];

// Call the startTask function for each task in the array

async function main() {
    try {
        let bot = createBot({
            username: 'task_validator',
    
            host: settings.host,
            port: settings.port,
            auth: settings.auth,
    
            version: settings.minecraft_version,
        });
        const tasks = ["harvest_1_sand", "harvest_1_oak_log"];
        console.log(tasks);
        bot.once('spawn', async function() {
            const results = await tasks.map(async (taskId, bot) => {
                const success = await startTask(taskId, bot);
                console.log(`Task ${taskId} complete and is ${success}`);
            });
        });
    } catch (error) {
        console.error(error);
    }
}

main();

// var taskId = "harvest_1_oak_log";
// await startTask(taskId);
// console.log("Task 1 complete");
// var taskId = "harvest_1_sand";
// await startTask(taskId);

// const taskType = "harvest";
// const tasksFile = readFileSync(`tasks/${taskType}_tasks.yaml`, 'utf8');
// const tasks = await yaml.load(tasksFile);
// console.log(tasks[0]);

// // todo: validate that this works for all specified tasks
// for (let task in tasks) {
//     var success = startTask(task);
//     // console.log(task);
//     // console.log(success);
//     if (!success) {
//         console.error('Task failed:', task);
//         // process.exit(1);
//     }
// }

// tasks.forEach(task => {
//     var success = startTask(task);
//     if (!success) {
//         console.error('Task failed:', task);
//         process.exit(1);
//     }
// });

