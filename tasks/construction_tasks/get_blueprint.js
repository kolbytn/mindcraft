import mineflayer from 'mineflayer';
import { worldToBlueprint, blueprintToTask } from '../../src/agent/tasks/construction_tasks.js';
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
    // set this to be minX, minY, minZ
    const startCoord = {
        x: -124, 
        y: 1, 
        z: 133,
    }
    bot.chat(`/tp andy ${startCoord.x} ${startCoord.y} ${startCoord.z}`);
    const yOffset = 2;
    const xOffset = 30;
    const zOffset = 20;

    const taskFilePath = '';
    const task_name = "flower_three_agents";
    

    setTimeout(async () => {
        let task_blueprint = await worldToBlueprint(startCoord, yOffset, xOffset, zOffset, bot);

        for (let i = 0; i < task_blueprint.levels.length; i++) {
            // Perform operations on each level
            const level = task_blueprint.levels[i];
            console.log("Level coordinates:", level.coordinates);
            const new_coordinates = [level.coordinates[0], -60 + i, level.coordinates[2]];
            level.coordinates = new_coordinates;
            console.log("New coordinates:", level.coordinates);
        }
        console.log("Blueprint generated:", task_blueprint.levels[0].coordinates);

        const task = blueprintToTask(task_blueprint, 3);
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
