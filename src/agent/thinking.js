
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { splitContentAndJSON } from '../utils/generation.js';

export class SelfDrivenThinking {
    constructor(agent) {
        this.agent = agent;
        this.todo_list = [];
        this.done_list = [];
        this.last_thinking_time = null;
        this.last_reflection_time = null;
        this.isSelfDrivenThinking = false;
        this.thinking_keys = ["person_desc", "longterm_thinking", "shortterm_thinking"];
    }

    init() {
        const thinking_file = `./bots/${this.agent.name}/thinking.json`;
        if (!existsSync(thinking_file)) {
            this.saveThinking();
        } else {
            let thinking = JSON.parse(readFileSync(thinking_file, 'utf8'));
            for (var key in this.thinking_keys) {
                if (this.agent.prompter.profile[key] !== undefined && thinking[key] !== undefined)
                    this.agent.prompter.profile[key] = thinking[key];
            }
        }
        this.agent.bot.on('idle', async () => {
            if (!this.agent.prompter.profile.reflection_interval || !this.agent.prompter.profile.thinking_interval) 
                return 

            const current_time = this.agent.bot.time.time;
            if (!this.isSelfDrivenThinking && (this.last_thinking_time === null || current_time - this.last_thinking_time > this.agent.prompter.profile.thinking_interval)) {
                this.isSelfDrivenThinking = true;
                this.last_thinking_time = current_time;
                if (this.last_reflection_time === null || current_time - this.last_reflection_time > this.agent.prompter.profile.reflection_interval) {
                    this.last_reflection_time = current_time;     
                    this.selfDrivenReflection()
                } else {
                    this.selfDrivenPlan()
                }
            }
        });
    }

    async selfDrivenReflection() {
        let prompt = this.agent.prompter.profile.thinking_reflection; 
        if (prompt && prompt.trim().length > 0) {
            prompt = await this.agent.prompter.replaceStrings(prompt);
            let generation = await this.agent.prompter.chat_model.sendRequest([], prompt);
            console.log(`${this.agent.name} performed reflection: ""${generation}""`);
            let to_self_message = "";
            let longterm_thinking = "";
            let shortterm_thinking = "";
            [to_self_message, longterm_thinking, shortterm_thinking, this.todo_list] = this.extractInfo(generation)
            this.done_list = []; 
            console.log(`${this.agent.name} reflection data: ""to_self_message = ${to_self_message}"", ""longterm_thinking = ${longterm_thinking}"", ""shortterm_thinking = ${shortterm_thinking}"", , ""todo = -${this.todo_list.join('-')}""`);

            if (longterm_thinking.trim().length > 0) {
                this.agent.prompter.profile.longterm_thinking = longterm_thinking;
                this.agent.prompter.saveThinking()
            }
            if (shortterm_thinking.trim().length > 0) {
                this.agent.prompter.profile.shortterm_thinking = shortterm_thinking;
                this.agent.prompter.saveThinking()
            }
            if (to_self_message.trim().length > 0) {
                await this.agent.handleMessage(this.agent.name, "[[Self-Driven Thinking]] " + to_self_message)
            }
        }
        this.isSelfDrivenThinking = false; 
    }

    async selfDrivenPlan() {
        let prompt = this.agent.prompter.profile.thinking_plan;
        if (prompt && prompt.trim().length > 0) {
            prompt = await this.agent.prompter.replaceStrings(prompt);
            await this.agent.handleMessage(this.agent.name, "[[Self-Driven Thinking]]" + prompt)
        }
        this.isSelfDrivenThinking = false; 
    }
    
    saveThinking(){
        const thinking_file = `./bots/${this.agent.name}/thinking.json`;
        let thinking = {}
        for (var key in this.thinking_keys) {
            if (this.agent.prompter.profile[key] !== undefined)
                thinking[key] = this.agent.prompter.profile[key];
        }
        writeFileSync(thinking_file, JSON.stringify(thinking, null, 4), (err) => {
            if (err) {
                throw new Error('Failed to save thinking:', err);
            }
            console.log("Thinking saved.");
        });
    }
    
    extractInfo(text) {
        let [content, data] = splitContentAndJSON(text);
        let to_self_message = ""
        let longterm_thinking = ""
        let shortterm_thinking = ""
        let todo = []
        if (data.to_self_message && typeof data.to_self_message === 'string') 
            to_self_message = data.to_self_message
        if (data.longterm_thinking && typeof data.longterm_thinking === 'string') 
            longterm_thinking = data.longterm_thinking
        if (data.shortterm_thinking && typeof data.shortterm_thinking === 'string') 
            shortterm_thinking = data.shortterm_thinking
        if (data.todo && Array.isArray(data.todo)) 
            todo = data.todo
        return [to_self_message, longterm_thinking, shortterm_thinking, todo]
    }
}