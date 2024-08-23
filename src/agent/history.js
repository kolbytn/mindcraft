import { writeFileSync, readFileSync } from 'fs';
import { NPCData } from './npc/data.js';


export class History {
    constructor(agent) {
        this.agent = agent;
        this.name = agent.name;
        this.memory_fp = `./bots/${this.name}/memory.json`;
        this.turns = [];

        // These define an agent's long term memory
        this.memory = '';

        // Variables for controlling the agent's memory and knowledge
        this.max_messages = 20;
    }

    getHistory() { // expects an Examples object
        return JSON.parse(JSON.stringify(this.turns));
    }

    async storeMemories(turns) {
        console.log("Storing memories...");
        this.memory = await this.agent.prompter.promptMemSaving(this.getHistory(), turns);
        console.log("Memory updated to: ", this.memory);
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
            while (this.turns[0].role != 'user' && this.turns.length > 1)
                to_summarize.push(this.turns.shift());
            await this.storeMemories(to_summarize);
        }
    }

    save() {
        // save history object to json file
        let data = {
            'name': this.name,
            'memory': this.memory,
            'turns': this.turns
        };
        if (this.agent.npc.data !== null)
            data.npc = this.agent.npc.data.toObject();
        const modes = this.agent.bot.modes.getJson();
        if (modes !== null)
            data.modes = modes;
        const memory_bank = this.agent.memory_bank.getJson();
        if (memory_bank !== null)
            data.memory_bank = memory_bank;
        if (this.agent.self_prompter.on) {
            data.self_prompt = this.agent.self_prompter.prompt;
        }
        const json_data = JSON.stringify(data, null, 4);
        writeFileSync(this.memory_fp, json_data, (err) => {
            if (err) {
                throw err;
            }
            console.log("JSON data is saved.");
        });
    }

    load() {
        try {
            // load history object from json file
            const data = readFileSync(this.memory_fp, 'utf8');
            const obj = JSON.parse(data);
            this.memory = obj.memory;
            this.agent.npc.data = NPCData.fromObject(obj.npc);
            if (obj.modes)
                this.agent.bot.modes.loadJson(obj.modes);
            if (obj.memory_bank)
                this.agent.memory_bank.loadJson(obj.memory_bank);
            this.turns = obj.turns;
            return obj;
        } catch (err) {
            console.error(`Error reading ${this.name}'s memory file: ${err.message}`);
        }
        return null;
    }

    clear() {
        this.turns = [];
        this.memory = '';
    }
}