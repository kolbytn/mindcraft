import { writeFileSync, readFileSync, mkdirSync } from 'fs';
import { NPCData } from './npc/data.js';
import settings from '../../settings.js';


export class History {
    constructor(agent) {
        this.agent = agent;
        this.name = agent.name;
        this.memory_fp = `./bots/${this.name}/memory.json`;
        this.full_history_fp = undefined;

        mkdirSync(`./bots/${this.name}/histories`, { recursive: true });

        this.turns = [];

        // Natural language memory as a summary of recent messages + previous memory
        this.memory = '';

        // Maximum number of messages to keep in context before saving chunk to memory
        this.max_messages = settings.max_messages;

        // Number of messages to remove from current history and save into memory
        this.summary_chunk_size = 5; 
        // chunking reduces expensive calls to promptMemSaving and appendFullHistory
    }

    getHistory() { // expects an Examples object
        return JSON.parse(JSON.stringify(this.turns));
    }

    async summarizeMemories(turns) {
        console.log("Storing memories...");
        this.memory = await this.agent.prompter.promptMemSaving(turns);

        if (this.memory.length > 500) {
            this.memory = this.memory.slice(0, 500);
            this.memory += '...(Memory truncated to 500 chars. Compress it more next time)';
        }

        console.log("Memory updated to: ", this.memory);
    }

    appendFullHistory(to_store) {
        if (this.full_history_fp === undefined) {
            const string_timestamp = new Date().toLocaleString().replace(/[/:]/g, '-').replace(/ /g, '').replace(/,/g, '_');
            this.full_history_fp = `./bots/${this.name}/histories/${string_timestamp}.json`;
            writeFileSync(this.full_history_fp, '[]', 'utf8');
        }
        try {
            const data = readFileSync(this.full_history_fp, 'utf8');
            let full_history = JSON.parse(data);
            full_history.push(...to_store);
            writeFileSync(this.full_history_fp, JSON.stringify(full_history, null, 4), 'utf8');
        } catch (err) {
            console.error(`Error reading ${this.name}'s full history file: ${err.message}`);
        }
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

        if (this.turns.length >= this.max_messages) {
            let chunk = this.turns.splice(0, this.summary_chunk_size);
            while (this.turns.length > 0 && this.turns[0].role === 'assistant')
                chunk.push(this.turns.shift()); // remove until turns starts with system/user message

            await this.summarizeMemories(chunk);
            this.appendFullHistory(chunk);
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