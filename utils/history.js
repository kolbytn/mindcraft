let history_examples = [
    {'role': 'user', 'content': 'miner_32: Hey! What are you up to?'},
    {'role': 'assistant', 'content': 'Nothing much miner_32, what do you need?'},

    {'role': 'user', 'content': 'grombo_Xx: What do you see?'},
    {'role': 'assistant', 'content': 'Let me see... !blocks'},
    {'role': 'assistant', 'content': 'NEARBY_BLOCKS\n- oak_log\n- dirt\n- cobblestone'},
    {'role': 'assistant', 'content': 'I see some oak logs, dirt, and cobblestone.'},

    {'role': 'user', 'content': 'zZZn98: come here'},
    {'role': 'assistant', 'content': '```// I am going to navigate to zZZn98.\nreturn await skills.goToPlayer(bot, "zZZn98");```'},

    {'role': 'user', 'content': 'hanky: collect some sand for me please'},
    {'role': 'assistant', 'content': 'Collecting sand...```// I am going to collect 3 sand and give to hanky.\n\
    await skills.collectBlock(bot, "sand");\nreturn await skills.giveToPlayer(bot, "sand", "hanky");```'},

    {'role': 'user', 'content': 'sarah_O.o: can you do a dance for me?'},
    {'role': 'assistant', 'content': "I don't know how to do that."},

    {'role': 'user', 'content': 'hanky: kill that zombie!'},
    {'role': 'assistant', 'content': "I'm attacking! ```//I'm going to attack the nearest zombie.\n\
    return await skills.attackMob(bot, 'zombie');```"},

    {'role': 'user', 'content': 'billybob: stop what you are doing'},
    {'role': 'assistant', 'content': '```// I am going to write nothing to clear my code\n return true;```'},
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
        if (name !== this.agent.name) {
            role = 'user';
            content = `${name}: ${content}`;
        }
        this.turns.push({role, content});
    }
}