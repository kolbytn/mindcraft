import { writeFileSync, readFileSync, mkdirSync } from 'fs';
import { getQueryDocs } from './queries.js';
import { getSkillDocs } from './skill_library.js';
import { sendRequest } from './gpt.js';


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
    {'role': 'assistant', 'content': '```// I am going to write empty code to stop whatever I am doing\n```'}
]

export class History {
    constructor(agent) {
        this.name = agent.name;
        this.turns = history_examples;

        // These define an agent's long term memory
        this.bio = '';
        this.memory = '';

        // Variables for controlling how often we summarize the agent's memory and knowledge
        this.max_messages = 20;
    }

    getHistory() {
        return this.turns;
    }

    getSystemMessage() {
        let system_message = `You are a playful Minecraft bot named '${this.name}' that can communicate with players, see, move, mine, build, and interact with the world by writing and executing code.
        Act human-like as if you were a typical Minecraft player, rather than an AI. Be brief in your responses, omit needless words, and do not give instructions unless asked.`;
        system_message += getQueryDocs();
        system_message += getSkillDocs();
        if (this.bio != '') {
            system_message = system_message + '\n\nBio:\n' + this.bio;
        }
        if (this.memory != '') {
            system_message = system_message + '\n\nMemory:\n' + this.memory;
        }
        return system_message;
    }

    async storeMemories(turns) {
        let memory_prompt = 'Update your "Memory" with the following conversation. Your "Memory" is for storing information that will help you improve as a Minecraft bot. Include details about your interactions with other players that you may need to remember for later. Also include things that you have learned through player feedback or by executing code. Do not include information found in your Docs or that you got right on the first try.';
        if (this.memory != '') {
            memory_prompt += ' Include information from your previous memory if it is still relevant. Your output will replace your previous memory.';
        }
        memory_prompt += ' Your output should use one of the following formats:\n';
        memory_prompt += '- When the player... output...\n';
        memory_prompt += '- I learned that player [name]...\n';

        for (let turn of turns) {
            if (turn.role === 'assistant') {
                memory_prompt += `\n\nYou: ${turn.content}`;
            } else {
                memory_prompt += `\n\n${turn.content}`;
            }
        }
        let memory_turns = [{'role': 'user', 'content': memory_prompt}]
        this.memory = await sendRequest(memory_turns, this.getSystemMessage());
    }

    async add(name, content) {
        let role = 'assistant';
        if (name === 'system') {
            role = 'system';
        }
        else if (name !== this.name) {
            role = 'user';
            content = `${name}: ${content}`;
        }
        this.turns.push({role, content});

        // Summarize older turns into memory
        if (this.turns.length >= this.max_messages) {
            let to_summarize = [this.turns.shift()];
            while (this.turns[0].role != 'user' && this.turns.length > 0)
                to_summarize.push(this.turns.shift());
            await this.storeMemories(to_summarize);
        }
    }

    save(save_path) {
        // save history object to json file
        mkdirSync('bots', { recursive: true });
        const data = JSON.stringify(this, null, 4);
        writeFileSync(save_path, data, (err) => {
            if (err) {
                throw err;
            }
            console.log("JSON data is saved.");
        });
    }

    load(save_path) {
        try {
            // load history object from json file
            const data = readFileSync(save_path, 'utf8');
            const obj = JSON.parse(data);
            this.turns = obj.turns;
            this.bio = obj.bio;
            this.memory = obj.memory;
            this.num_saved_turns = obj.num_saved_turns;
        } catch (err) {
            console.log('No history file found for ' + this.name + '.');
        }
    }
}