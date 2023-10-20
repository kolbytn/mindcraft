import { sendRequest } from './utils/gpt.js';
import { getHistory, addEvent } from './utils/history.js';
import { getStats, getInventory, getBlocks, getNearbyPlayers, getNearbyEntities, getCraftable } from './utils/context.js';
import { currentCode, executeCode, writeCode } from './act.js';
import { getCommand, getCommandDocs } from './utils/commands.js';


function buildSystemMessage(bot) {
    let message = `You are a playful Minecraft bot that can communicate with players and move within and interact with the world.';
                    Act human-like as if you were a typical Minecraft player, rather than an AI.';
                    Do not give instructions unless asked, and always be brief in your responses.\n`;
    message += getCommandDocs();
    return message;
}



const MAX_TURNS = 5;
export async function getChatResponse(bot, user, message) {
    addEvent(user, message);
    let turns = getHistory(user);
    let systemMessage = buildSystemMessage();

    let botFinalRes = '';
    let botEvent = '';
    let botRes = null;
    console.log("*recieved chat:", message)
    for (let i = 0; i < MAX_TURNS; i++) {
        botRes = await sendRequest(turns, systemMessage, '\`\`\`');
        console.log(`bot response ${i}:`, botRes);

        let commandRes = null;
        let firstword = botRes.trim().split(/\s+/)[0];
        let command = getCommand(firstword);
        if (command) {
            console.log('Executing command:', command.name)
            commandRes = await command.perform(bot);
            
            botEvent += `/n${command.name}/n${commandRes}`;
            if (i == 0)
                turns.push(botEvent);
            else
                turns[turns.length - 1] += botEvent;
        } else {
            botFinalRes = botRes;
            break;
        }
    }

    console.log('*bot response', botFinalRes);
    console.log('*bot event', botEvent);
    addEvent('bot', botEvent);
    return botFinalRes.trim();
}
