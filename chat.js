import { sendRequest } from './utils/gpt.js';
import { getHistory, addEvent } from './utils/history.js';
import { getStats, getInventory, getBlocks, getNearbyEntities, getCraftable } from './utils/context.js';
import { currentCode, writeCode } from './act.js';


function buildSystemMessage() {
    let message = 'You are a playful Minecraft bot that can communicate with players and move within and interact with the world.';
    message += ' Act human-like as if you were a typical Minecraft player, rather than an AI.';
    message += ' Do not give instructions unless asked, and always be brief in your responses.';
    message += '\n\nYou can use the following commands followed by to query for information about the world.';
    message += ' The query response will be returned between sets of "\`\`\`":';
    message += '\n!stats - get player and world stats (e.g. current health and time of day)';
    message += '\n!inventory - get your current inventory';
    message += '\n!blocks - get a list of nearby blocks';
    message += '\n!craftable - get a list of craftable items with your current inventory';
    message += '\n!entities - get a list of nearby players and entities';
    message += '\n!action - get the currently executing code';
    message += '\n\nYou can also execute actions such as moving and mining in Minecraft by writing javascript code.';
    message += ' To do so, simply begin a codeblock with the "!execute" command. For example:';
    message += '\n!execute\n\`\`\`\nCODE\n\`\`\`';
    return message;
}


export async function getChatResponse(bot, user, message) {
    addEvent(user, message);
    let turns = getHistory(user);
    let systemMessage = buildSystemMessage();

    let botResponse = '';
    let botEvent = '';
    let res = null;
    for (let i = 0; i < 5; i++) {

        res = await sendRequest(turns, systemMessage, '\`\`\`');
        console.log('received chat:', res);

        let queryRes = null;
        if (res.includes('!stats')) {
            queryRes = '\n\n!stats\n\`\`\`\n' + getStats(bot) + '\n\`\`\`';
        } else if (res.includes('!inventory')) {
            queryRes = '\n\n!inventory\n\`\`\`\n' + getInventory(bot) + '\n\`\`\`';
        } else if (res.includes('!blocks')) {
            queryRes = '\n\n!blocks\n\`\`\`\n' + getBlocks(bot) + '\n\`\`\`';
        } else if (res.includes('!craftable')) {
            queryRes = '\n\n!craftable\n\`\`\`\n' + getCraftable(bot) + '\n\`\`\`';
        } else if (res.includes('!entities')) {
            queryRes = '\n\n!entities\n\`\`\`\n' + getNearbyEntities(bot) + '\n\`\`\`';
        } else if (res.includes('!action')) {
            queryRes = '\n\n!action\n\`\`\`\n' + currentCode + '\n\`\`\`';
        } else if (res.includes('!execute')) {
            queryRes = '\n\n!execute\n\`\`\`\n' + await writeCode(bot, user, turns.concat(botResponse), botResponse) + '\n\`\`\`';
        } else {
            botResponse += '\n' + res.trim();
            break;
        }

        console.log('query response:', queryRes);
        botEvent += queryRes;
        turns[turns.length - 1] += queryRes
    }

    console.log('sending chat:', botResponse.trim());
    addEvent('bot', botEvent);
    return botResponse.trim();
}
