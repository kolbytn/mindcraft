import { sendRequest } from './utils/gpt.js';
import { getHistory, addEvent } from './utils/history.js';
import { getStats, getInventory, getBlocks, getNearbyPlayers, getNearbyEntities, getCraftable } from './utils/context.js';
import { currentCode, executeCode, writeCode } from './act.js';


function buildSystemMessage(bot) {
    let message = 'You are a playful Minecraft bot that can communicate with players and move within and interact with the world.';
    message += ' Act human-like as if you were a typical Minecraft player, rather than an AI.';
    message += ' Do not give instructions unless asked, and always be brief in your responses.';
    message += '\n\nYou can use the following commands followed by to query for information about the world.';
    message += ' The query response will be returned between sets of "\`\`\`":';
    message += '\n!stats - get your current health and other player stats';
    message += '\n!inventory - get your current inventory';
    message += '\n!blocks - get a list of nearby blocks';
    message += '\n!craftable - get a list of craftable items with your current inventory';
    message += '\n!entities - get a list of nearby players and entities';
    message += '\n!action - prints the currently executing code';
    message += '\n\nYou can also execute actions in Minecraft by writing javascript code.';
    message += ' To do so, simply begin a codeblock with the "!execute" command. For example:';
    message += '\n!execute\n\`\`\`\nCODE\n\`\`\`';
    return message;
}


export async function getChatResponse(bot, user, message) {
    addEvent(user, message);
    let turns = getHistory(user);
    let systemMessage = buildSystemMessage(bot);

    let botResponse = '';
    let botEvent = '';
    let res = null;
    for (let i = 0; i < 5; i++) {

        res = await sendRequest(turns, systemMessage, '\`\`\`');
        console.log('received chat:', res);

        let queryRes = null;
        if (res.trim().slice(res.length - 7) == '!stats') {
            botResponse += '\n' + res.trim().slice(0, res.length - 7).trim();
            queryRes = '\n\n!stats\n\`\`\`\n' + getStats(bot) + '\n\`\`\`';
        } else if (res.trim().slice(res.length - 11) == '!inventory') {
            botResponse += '\n' + res.trim().slice(0, res.length - 11).trim();
            queryRes = '\n\n!inventory\n\`\`\`\n' + getInventory(bot) + '\n\`\`\`';
        } else if (res.trim().slice(res.length - 8) == '!blocks') {
            botResponse += '\n' + res.trim().slice(0, res.length - 8).trim();
            queryRes = '\n\n!blocks\n\`\`\`\n' + getBlocks(bot) + '\n\`\`\`';
        } else if (res.trim().slice(res.length - 11) == '!craftable') {
            botResponse += '\n' + res.trim().slice(0, res.length - 11).trim();
            queryRes = '\n\n!craftable\n\`\`\`\n' + getCraftable(bot) + '\n\`\`\`';
        } else if (res.trim().slice(res.length - 10) == '!entities') {
            botResponse += '\n' + res.trim().slice(0, res.length - 10).trim();
            queryRes = '\n\n!entities\n\`\`\`\n' + getNearbyPlayers(bot) + '\n' + getNearbyEntities(bot) + '\n\`\`\`';
        } else if (res.trim().slice(res.length - 8) == '!action') {
            botResponse += '\n' + res.trim().slice(0, res.length - 8).trim();
            queryRes = '\n\n!action\n\`\`\`\n' + currentCode + '\n\`\`\`';
        } else if (res.trim().slice(res.length - 9) == '!execute') {
            botResponse += '\n' + res.trim().slice(0, res.length - 9).trim();
            queryRes = '\n\n!execute\n\`\`\`\n' + await writeCode(bot, user, turns.concat(botResponse), botResponse) + '\n\`\`\`';
        } else {
            break;
        }

        botEvent += queryRes;
        turns[turns.length - 1] += queryRes
    }

    console.log('sending chat:', botResponse);
    addEvent('bot', botEvent);
    return botResponse.trim();
}
