import { writeFileSync, readFileSync, mkdirSync } from 'fs';
import { sendRequest } from './gpt.js';


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
        this.name = agent.name;
        this.turns = history_examples;

        // These define an agent's long term memory
        this.bio = 'Your personality is friendly. Your goal is to help.';
        this.memory = '';
        this.knowledge = '';
        this.num_saved_turns = 0;

        // Variables for controlling how often we summarize the agent's memory and knowledge
        this.max_messages = 20;
        this.save_size = 10;
        this.save_step = 7;
    }

    getHistory() {
        return this.turns;
    }

    async storeMemories(turns) {
        const memory_message = 'You are a minecraft bot. ' + this.bio + '\n\nCurrent Memory:\n' + this.memory;
        let memory_prompt = 'Update your memory with the following conversation. Include only conversational details about other players that you may need to remember for later. Your output should be a short paragraph summarizing what you have experienced.\n';
        for (let turn of turns) {
            if (turn.role === 'user') {
                memory_prompt += `\n${turn.content}`;
            } else {
                memory_prompt += `\nYou: ${turn.content}`;
            }
        }
        let memory_turns = [{'role': 'user', 'content': memory_prompt}]
        this.memory = await sendRequest(memory_turns, memory_message);

        const knowledge_message = 'You are a minecraft bot. ' + this.bio + '\n\nCurrent Knowledge: ' + this.knowledge;
        let knowledge_prompt = 'Update your current knowledge with the following conversation. Include only knowledge you have gained about how to interact with the world and execute actions that you may need to remember for later. Your output should be a short paragraph summarizing what you have learned.\n';
        for (let turn of turns) {
            if (turn.role === 'user') {
                knowledge_prompt += `\n${turn.content}`;
            } else {
                knowledge_prompt += `\nYou: ${turn.content}`;
            }
        }
        let knowledge_turns = [{'role': 'user', 'content': knowledge_prompt}]
        this.knowledge = await sendRequest(knowledge_turns, knowledge_message);
    }

    async add(name, content) {
        let role = 'assistant';
        if (name !== this.name) {
            role = 'user';
            content = `${name}: ${content}`;
        }
        this.turns.push({role, content});

        // Summarize older turns into memory
        if (this.turns.length >= this.max_messages) {
            // Don't summarize the examples
            if (this.num_saved_turns + this.save_step >= history_examples.length && 
                    this.num_saved_turns < history_examples.length) {
                await this.storeMemories(
                    this.turns.slice(history_examples.length - this.num_saved_turns, this.save_size)
                );
            } else if (this.num_saved_turns >= history_examples.length) {
                await this.storeMemories(this.turns.slice(0, this.save_size));
            }
            this.turns = this.turns.slice(this.save_step);
            this.num_saved_turns += this.save_step;
        }
    }

    save() {
        // save history object to json file
        mkdirSync('bots', { recursive: true });
        const data = JSON.stringify(this, null, 4);
        writeFileSync('bots/' + this.name + '.json', data, (err) => {
            if (err) {
                throw err;
            }
            console.log("JSON data is saved.");
        });
    }

    load() {
        try {
            // load history object from json file
            const data = readFileSync('bots/' + this.name + '.json', 'utf8');
            const obj = JSON.parse(data);
            this.turns = obj.turns;
            this.bio = obj.bio;
            this.memory = obj.memory;
            this.knowledge = obj.knowledge;
            this.num_saved_turns = obj.num_saved_turns;
        } catch (err) {
            console.log('No history file found for ' + this.name + '.');
        }
    }
}