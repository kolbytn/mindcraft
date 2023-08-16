import { writeFile } from 'fs';

import { getStats, getInventory, getNearbyBlocks, getNearbyPlayers, getNearbyEntities, getCraftable, getDetailedSkills } from './utils/context.js';
import { sendRequest } from './utils/gpt.js';


function buildSystemMessage(bot) {
    let message = 'You are a helpful Minecraft bot. Given the dialogue and currently running program, reflect on what you are doing and generate javascript code to accomplish that goal. If your new code is empty, no change will be made to your currently running program. Use only functions listed below to write your code.';
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
    let skills = getDetailedSkills();
    if (skills)
        message += "\n\n" + skills;
    return message;
}


function buildExamples() {
    return[
`mr_steve2: Will you help me collect wood?
You: I'd be glad to help you collect wood.
Current code:
\`\`\`
await skills.ExploreToFind(bot, 'iron_ore');
\`\`\``,
`I'm going to help mr_steve2 collect wood rather than look for iron ore. The type of wood block nearby is 'oak_log'. I'll adjust my code to collect 'oak_log' for mr_steve2 until told to stop.
\`\`\`
while (true) {
    await skills.CollectBlock(bot, 'oak_log', 1);
    await skills.GoToPlayer(bot, 'mr_steve2');
    await skills.DropItem(bot, 'oak_log', 1);
}
\`\`\``,
`sally32: What are you doing?
You: I'm looking for coal. Have you seen any?
Current code:
\`\`\`
await skills.ExploreToFind(bot, 'coal_ore');
await skills.EquipItem(bot, 'wooden_pickaxe');
await skills.CollectBlock(bot, 'coal_ore', 10);
\`\`\``,
`I responded to a question. I do not need to change my code.
\`\`\`
\`\`\``,
    ]
}


async function executeCode(bot, code) {
    let src = `import * as skills from './utils/skills.js';\n\n`;
    src += `export async function main(bot) {\n`;
    for (let line of code.split('\n')) {
        src += `    ${line}\n`;
    }
    src += `}\n`;
    
    writeFile('./temp.js', src, (err) => {
        if (err) throw err;
    });
    await (await import('./temp.js')).main(bot);
}


var currentCode = '';
export async function actIfNeeded(bot, username, message, res) {
    let turns = buildExamples();
    turns.push(`${username}: ${message}\nYou: ${res}\nCurrent Code:\`\`\`\n${currentCode}\n\`\`\``);
    let systemMessage = buildSystemMessage(bot);
    let actResponse = await sendRequest(turns, systemMessage);
    console.log(actResponse);

    let code = actResponse.split('\`\`\`');
    if (code.length <= 1)
        return false;
    if (!code[1].trim())
        return false;

    currentCode = code[1].trim();
    if (currentCode.slice(0, 10) == 'javascript')
        currentCode = currentCode.slice(10).trim();

    await executeCode(bot, currentCode);
    return true;
}
