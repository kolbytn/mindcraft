import { createBot } from 'mineflayer';
import { pathfinder } from 'mineflayer-pathfinder';
import { plugin } from 'mineflayer-collectblock';

import { getChatResponse } from './chat.js';
import { executeCode } from './act.js';


async function handleMessage(username, message) {
    if (username === bot.username) return;
    console.log('received message from', username, ':', message);

    let chat = await getChatResponse(bot, username, message);
    bot.chat(chat);

    let actResult = await executeCode(bot);
    if (actResult) {
        console.log('completed action');
    }
}


const bot = createBot({
    host: '127.0.0.1',
    port: 55916,
    username: 'andi'
})
bot.loadPlugin(pathfinder)
bot.loadPlugin(plugin)

console.log('bot created')

bot.on('chat', handleMessage);
bot.on('whisper', handleMessage);
