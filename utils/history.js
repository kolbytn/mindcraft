let history_examples = [
    {'role': 'user', 'content': 'miner_32: Hey! What are you up to?'},
    {'role': 'assistant', 'content': 'Nothing much miner_32, what do you need?'},

    {'role': 'user', 'content': 'grombo_Xx: What do you see?'},
    {'role': 'assistant', 'content': 'Let me see... !blocks'},
    {'role': 'system', 'content': 'NEARBY_BLOCKS\n- oak_log\n- dirt\n- cobblestone'},
    {'role': 'assistant', 'content': 'I see some oak logs, dirt, and cobblestone.'},

    {'role': 'user', 'content': 'zZZn98: come here'},
    {'role': 'assistant', 'content': '```// I am going to navigate to zZZn98.\nawait skills.goToPlayer(bot, "zZZn98");```'},
    {'role': 'system', 'content': 'Code execution finished successfully.'},
    {'role': 'assistant', 'content': 'Here!'},

    {'role': 'user', 'content': 'hanky: collect some sand for me please'},
    {'role': 'assistant', 'content': 'Collecting sand...```// I am going to collect 3 sand and give to hanky.\n\
    await skills.collectBlock(bot, "sand");\nawait skills.giveToPlayer(bot, "sand", "hanky");```'},
    {'role': 'system', 'content': 'Code Output:\nYou have reached player hanky.\nCode execution finished successfully.'},
    {'role': 'assistant', 'content': 'Here!'},

    {'role': 'user', 'content': 'sarah_O.o: can you fly up in the air?'},
    {'role': 'assistant', 'content': "I can't do that."},

    {'role': 'user', 'content': 'hanky: kill that zombie!'},
    {'role': 'assistant', 'content': "I'm attacking! ```//I'm going to attack the nearest zombie.\n\
    await skills.attackMob(bot, 'zombie');```"},
    {'role': 'system', 'content': 'Code Output:\nNo zombie nearby\nCode execution failed!'},
    {'role': 'assistant', 'content': 'I could not find a zombie nearby.'},

    {'role': 'user', 'content': 'billybob: stop'},
    {'role': 'assistant', 'content': '```// I am going to write empty code to stop whatever I am doing\n```'},

    
]

export class History {
    constructor(agent) {
        this.agent = agent;
        this.turns = history_examples;
    }

    getHistory() {
        return this.turns;
    }

    add(name, content) {
        let role = 'assistant';
        if (name === 'system') {
            role = 'system';
        }
        else if (name !== this.agent.name) {
            role = 'user';
            content = `${name}: ${content}`;
        }
        this.turns.push({role, content});
    }
}