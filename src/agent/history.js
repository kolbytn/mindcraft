import { writeFileSync, readFileSync, mkdirSync } from 'fs';


export class History {
    constructor(agent) {
        this.agent = agent;
        this.name = agent.name;
        this.memory_fp = `./bots/${this.name}/memory.json`;
        this.turns = [];

        // These define an agent's long term memory
        this.memory = '';
        this.goals = [];

        // Variables for controlling the agent's memory and knowledge
        this.max_messages = 20;
    }

    getHistory() { // expects an Examples object
        return JSON.parse(JSON.stringify(this.turns));
    }

    async storeMemories(turns) {
        console.log("Storing memories...");
        this.memory = await this.agent.prompter.promptMemSaving(this.memory, turns);
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
            'goals': this.goals,
            'turns': this.turns
        };
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
            this.turns = obj.turns;
            this.goals = obj.goals;
        } catch (err) {
            console.error(`No memory file '${this.memory_fp}' for agent ${this.name}.`);
        }
    }

    clear() {
        this.turns = [];
        this.memory = '';
    }
}