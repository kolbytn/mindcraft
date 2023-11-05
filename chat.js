import { sendRequest } from './utils/gpt.js';
import { getHistory, addEvent } from './utils/history.js';
import { containsCommand, getCommand, getCommandDocs } from './utils/commands.js';


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
    console.log("*recieved chat:", message);
    for (let i = 0; i < MAX_TURNS; i++) {
        botRes = await sendRequest(turns, systemMessage, '\`\`\`');
        console.log(`bot response ${i}: "${botRes}"`);
        let command_name = containsCommand(botRes)
        if (command_name) {
            let command = getCommand(command_name);
            let commandRes = await command.perform(bot, user, turns.concat(botRes));
            
            botEvent += `/n${command.name}/n${commandRes}`;
            if (i == 0)
                turns.push(botEvent);
            else
                turns[turns.length - 1] += botEvent;
            if (command_name == '!execute') {
                botFinalRes = "Executing Code";
                break;
            }
        } else {
            botFinalRes = botRes;
            break;
        }
    }

    console.log('*bot response', botFinalRes);
    console.log('*bot event', botEvent);
    addEvent('bot', turns[turns.length - 1]);
    return botFinalRes.trim();
}
