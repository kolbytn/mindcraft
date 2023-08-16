import { sendRequest } from './utils/gpt.js';
import { getHistory, addEvent } from './utils/history.js';
import { getStats, getInventory, getNearbyBlocks, getNearbyPlayers, getNearbyEntities, getCraftable } from './utils/context.js';


function buildSystemMessage(bot) {
    let message = 'You are a helpful Minecraft bot that can communicate with players and execute actions in the environment. Act human-like as if you were a typical Minecraft player, rather than an AI. Do not give instructions unless asked.';
    let stats = getStats(bot);
    if (stats)
        message += "\n\n" + stats;
    let inventory = getInventory(bot);
    if (inventory)
        message += "\n\n" + inventory;
    let nearbyBlocks = getNearbyBlocks(bot);
    if (nearbyBlocks)
        message += "\n\n" + nearbyBlocks;
    let nearbyPlayers = getNearbyPlayers(bot);
    if (nearbyPlayers)
        message += "\n\n" + nearbyPlayers;
    let nearbyEntities = getNearbyEntities(bot);
    if (nearbyEntities)
        message += "\n\n" + nearbyEntities;
    let craftable = getCraftable(bot);
    if (craftable)
        message += "\n\n" + craftable;
    return message;
}


function buildTurns(user, message) {
    let history = getHistory();

    let turns = [];
    let lastSource = null;
    for (let i = 0; i < history.length; i++) {

        if (history[i].source == 'bot' && lastSource == null) {
            turns.push('(You spawn into the word.)');
            turns.push(history[i].message);

        } else if (history[i].source == 'bot' && lastSource != 'bot') {
            turns.push(history[i].message);

        } else if (history[i].source == 'bot' && lastSource == 'bot') {
            turns[turns.length - 1] += '\n\n' + history[i].message;

        } else if (history[i].source != 'bot' && lastSource == 'bot') {
            turns.push(history[i].message);

        } else if (history[i].source != 'bot' && lastSource != 'bot') {
            turns[turns.length - 1] += '\n\n' + history[i].message;
        }
        lastSource = history[i].source;
    }
    return turns;
}


export async function getChatResponse(bot, user, message) {
    addEvent(user, user + ': ' + message);
    let turns = buildTurns(user, message);
    let systemMessage = buildSystemMessage(bot);
    let res = await sendRequest(turns, systemMessage);
    console.log('sending chat:', res);
    addEvent('bot', res);
    return res;
}