import { resetConstructionWorld } from "../src/agent/tasks.js";
import mineflayer from 'mineflayer';

const bot = mineflayer.createBot({
    host: 'localhost', // Replace with your server IP or hostname
    port: 55916,       // Replace with your server port
    username: 'andy', // Replace with your bot's username
    // password: 'your_bot_password' // Only if the server has online-mode=true
});

bot.on('spawn', async () => {
    bot.chat("/tp andy izzycw");
    resetConstructionWorld(bot);
});