import { writeFile } from 'fs';

import { getDetailedSkills, getWorldFunctions } from './utils/context.js';
import { sendRequest } from './utils/gpt.js';


function buildSystemMessage(bot) {
    let message = 'You are a helpful Minecraft bot. Given the dialogue, reflect on what you are doing and generate javascript code to accomplish that goal. Use only functions listed below to write your code.';
    message += "\n\n" + getDetailedSkills();
    message += "\n\n" + getWorldFunctions();
    return message;
}


function buildExamples() {
    return [
`mr_steve2: Will you help me collect wood?

!blocks
\`\`\`
NEARBY_BLOCKS
- oak_log
- dirt
- cobblestone
\`\`\`

Me: I'd be glad to help you collect wood.`,
`I'm going to help mr_steve2 collect wood. The type of wood block nearby is 'oak_log'. I'll adjust my code to collect an 'oak_log' for mr_steve2.
\`\`\`
await skills.collectBlock(bot, 'oak_log');
await skills.giveToPlayer(bot, 'oak_log', 'mr_steve2');
\`\`\``,
`sally32: What are you doing?

!action
\`\`\`
await skills.equipItem(bot, 'wooden_pickaxe');
while (world.getInventory(bot).coal_ore < 10) {
    await skills.collectBlock(bot, 'coal_ore');
}
\`\`\`

Me: I'm looking for coal. Have you seen any?

sally32: Yes, there's some in this cave, follow me.`,
`I'm going to follow sally32 to the cave and collect coal. I'll adjust my code to follow sally32 until I find coal_ore and then I'll mine it.
\`\`\`
while (true) {
    await skills.goToPlayer(bot, 'sally32');
    if (world.getNearbyBlocks(bot).includes('coal_ore')) {
        break;
    }
}
await skills.equipItem(bot, 'wooden_pickaxe');
while (world.getInventory(bot).coal_ore < 10) {
    await skills.collectBlock(bot, 'coal_ore');
}
\`\`\``,
`user42: come here

Me: Sure! I'm on my way.`,
`I'm going to navigate to user42.
\`\`\`
await skills.goToPlayer(bot, 'user42');
\`\`\``,
    ]
}


export var currentCode = '';


export async function executeCode(bot) {
    let src = "import * as skills from './utils/skills.js';";
    src += "\nimport * as world from './utils/world.js';"
    src += `\n\nexport async function main(bot) {\n`;
    for (let line of currentCode.split('\n')) {
        src += `    ${line}\n`;
    }
    src += `}\n`;
    
    writeFile('./temp.js', src, (err) => {
        if (err) throw err;
    });

    console.log('executing code...\n' + currentCode);
    try {
        await (await import('./temp.js')).main(bot);
    } catch (err) {
        console.log(err);
        currentCode = '';
        return false;
    }

    currentCode = '';
    return true;
}


export async function writeCode(bot, username, messages) {
    let turns = buildExamples();

    // For now, get rid of the first 6 example messages
    messages = messages.slice(6);

    let startIndex = messages.length - 6;
    if (startIndex < 0)
        startIndex = 0;

    turns.push('');
    for (let i = startIndex; i < messages.length; i++) {
        if (i % 2 == 0) {
            turns[turns.length - 1] += `\n\n${username}: ${messages[i]}`;
        } else {
            turns[turns.length - 1] += `\n\nMe: ${messages[i]}`;
        }
    }
    turns[turns.length - 1] = turns[turns.length - 1].trim();
    let systemMessage = buildSystemMessage(bot);
    let actResponse = await sendRequest(turns, systemMessage);
    console.log(actResponse);

    let code = actResponse.split('\`\`\`');
    if (code.length <= 1)
        return code;
    if (!code[1].trim())
        return code;

    currentCode = code[1].trim();
    if (currentCode.slice(0, 10) == 'javascript')
        currentCode = currentCode.slice(10).trim();

    return currentCode;
}
