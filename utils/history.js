var messages = [
{'source': 'all', 'message': 'Hey! What are you up to?'},
{'source': 'bot', 'message': `!action
\`\`\`
await skills.ExploreToFind(bot, 'coal_ore');
await skills.EquipItem(bot, 'wooden_pickaxe');
await skills.CollectBlock(bot, 'coal_ore', 10);
\`\`\`

I'm looking for coal. Have you seen any?`},
{'source': 'all', 'message': 'No, but can you help me collect wood?'},
{'source': 'bot', 'message': `!blocks
\`\`\`
NEARBY_BLOCKS
- oak_log
- dirt
- cobblestone
- birch_log
\`\`\`

Sure, do you want oak or birch?`},
{'source': 'all', 'message': 'Thanks! Either is fine.'},
{'source': 'bot', 'message': `I'll do that now.

!execute
\`\`\`
while (true) {
    await skills.CollectBlock(bot, 'oak_log', 1);
    await skills.goToPlayer(bot, 'username');
    await skills.DropItem(bot, 'oak_log', 1);
}
\`\`\``}
];


export function addEvent(source, message) {
    messages.push({source, message});
}


export function getHistory(source) {
    let res = [];
    let lastSource = null;
    for (let i = 0; i < messages.length; i++) {
        if (lastSource != source && (messages[i].source == source || messages[i].source == 'all')) {
            res.push(messages[i].message);
            lastSource = source;
        } else if (lastSource == source && (messages[i].source == source || messages[i].source == 'all')) {
            res[-1] += '\n\n' + messages[i].message;
        } else if (lastSource == source && messages[i].source == 'bot') {
            res.push(messages[i].message);
            lastSource = 'bot';
        } else if (lastSource == 'bot' && messages[i].source == 'bot') {
            res[-1] += '\n\n' + messages[i].message;
        } else {
            lastSource = null;
        }
    }
    return res;
}
