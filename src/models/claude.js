import Anthropic from '@anthropic-ai/sdk';
import { GPT } from './gpt.js';

export class Claude {
    constructor(model_name) {
        this.model_name = model_name;
        if (!process.env.ANTHROPIC_API_KEY) {
            throw new Error('Anthropic API key missing! Make sure you set your ANTHROPIC_API_KEY environment variable.');
        }

        this.anthropic = new Anthropic({
            apiKey: process.env["ANTHROPIC_API_KEY"]
          });

        this.gpt = undefined;
        try {
            this.gpt = new GPT(); // use for embeddings, ignore model
        } catch (err) {
            console.warn('Claude uses the OpenAI API for embeddings, but no OPENAI_API_KEY env variable was found. Claude will still work, but performance will suffer.');
        }
    }

    async sendRequest(turns, systemMessage) {
        let prev_role = null;
        let messages = [];
        let filler = {role: 'user', content: '_'};
        for (let msg of turns) {
            if (msg.role === 'system') {
                msg.role = 'user';
                msg.content = 'SYSTEM: ' + msg.content;
            }
            if (msg.role === prev_role && msg.role === 'assistant') {
                // insert empty user message to separate assistant messages
                messages.push(filler);
                messages.push(msg);
            }
            else if (msg.role === prev_role) {
                // combine new message with previous message instead of adding a new one
                messages[messages.length-1].content += '\n' + msg.content;
            }
            else {
                messages.push(msg);
            }
            prev_role = msg.role;
            
        }
        if (messages.length === 0) {
            messages.push(filler);
        }
        
        let res = null;
        try {
            console.log('Awaiting anthropic api response...')
            console.log('Messages:', messages);
            const resp = await this.anthropic.messages.create({
                model: this.model_name,
                system: systemMessage,
                max_tokens: 2048,
                messages: messages,
            });
            console.log('Received.')
            res = resp.content[0].text;
        }
        catch (err) {
            console.log(err);
            res = 'My brain disconnected, try again.';
        }
        return res;
    }

    async embed(text) {
        if (this.gpt) {
            return await this.gpt.embed(text);
        }
        // if no gpt, just return random embedding
        return Array(1).fill().map(() => Math.random());
    }
}



