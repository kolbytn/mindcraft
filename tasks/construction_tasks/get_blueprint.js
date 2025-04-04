import mineflayer from 'mineflayer';
import { worldToBlueprint, blueprintToTask } from '../../src/agent/task_types/construction_tasks.js';
import fs from 'fs';
import { start } from 'repl';

const bot = mineflayer.createBot({
    host: 'localhost', // Replace with your server IP or hostname
    port: 55916,       // Replace with your server port
    username: 'andy', // Replace with your bot's username
    // password: 'your_bot_password' // Only if the server has online-mode=true
});

bot.on('spawn', async () => {
    console.log("Bot spawned. Starting blueprint check...");
    const startCoord = {
        x: -60, 
        y: 1, 
        z: 6,
    }
    bot.chat(`/tp andy ${startCoord.x} ${startCoord.y} ${startCoord.z}`);
    const yOffset = 5;
    const xOffset = 10;
    const zOffset = 10;

    const taskFilePath = '/Users/isadorawhite/izzy_mindcraft/mindcraft/tasks/construction_tasks/custom/pyramid.json';
    const task_name = "pyramid";
    

    setTimeout(async () => {
        let task_blueprint = await worldToBlueprint(startCoord, yOffset, xOffset, zOffset, bot);

        for (const level of task_blueprint.levels) {
            // Perform operations on each level
            console.log("Level coordinates:", level.coordinates);
            const new_coordinates = [level.coordinates[0], -60, level.coordinates[2]];
            level.coordinates = new_coordinates;
            console.log("New coordinates:", level.coordinates);
        }
        console.log("Blueprint generated:", task_blueprint.levels[0].coordinates);

        const task = blueprintToTask(task_blueprint, 2);
        const task_collection = {}
        task_collection[task_name] = task;

        fs.writeFileSync(taskFilePath, JSON.stringify(task_collection, null, 2), (err) => {
            if (err) {
                console.error('Error writing task to file:', err);
            } else {
                console.log('Task dumped to file successfully.');
            }
        });
    }, 5000); // Delay of 5 seconds (5000 milliseconds)
});
