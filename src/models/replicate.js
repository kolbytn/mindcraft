import Replicate from 'replicate';

// llama, mistral
export class ReplicateAPI {
    constructor(model_name, url) {
        this.model_name = model_name;
        this.url = url;

        if (!process.env.REPLICATE_API_KEY) {
            throw new Error('Replicate API key missing! Make sure you set your REPLICATE_API_KEY environment variable.');
        }

        this.replicate = new Replicate({
            auth: process.env.REPLICATE_API_KEY,
        });
    }

    async sendRequest(turns, systemMessage) {
        if (this.url) {
            
        }

        let prev_role = null;
        let messages = [];
        let filler = { role: 'user', content: '_' };

        for (let msg of turns) {
        if (msg.role === 'system') {
            msg.role = 'user';
            msg.content = 'SYSTEM: ' + msg.content;
        }
        if (msg.role === prev_role && msg.role === 'assistant') {
            // insert empty user message to separate assistant messages
            messages.push(filler);
            messages.push(msg);
        } else if (msg.role === prev_role) {
            // combine new message with previous message instead of adding a new one
            messages[messages.length - 1].content += '\n' + msg.content;
        } else {
            messages.push(msg);
        }
        prev_role = msg.role;
        }

        const prompt = '\n\n' + messages.map(msg => `${msg.role}: ${msg.content}`).join('\n');
        const input = {
            prompt: prompt,
            top_p: 0.95,
            prompt_template: "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n"+systemMessage+"<|eot_id|><|start_header_id|>user<|end_header_id|>\n\n{prompt}<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n",
            presence_penalty: 0,
            frequency_penalty: 0
        };
    

        let res = null;
        try {
          console.log('Awaiting Replicate API response...');
          console.log('Input:', input);
          let result = '';
          for await (const event of this.replicate.stream(this.model_name, { input })) {
            result += event;
          }
          console.log('Received.');
          res = result;
        } catch (err) {
          console.log(err);
          res = 'My brain disconnected, try again.';
        }
    
        return res;
    }
    "You are a playful Minecraft bot named andy that can converse with players, see, move, mine, build, and interact with the world by using commands. Act human-like as if you were a typical Minecraft player, rather than an AI. Be very brief in your responses, don't apologize constantly, don't give instructions or make lists unless asked, and don't refuse requests. Don't pretend to act, use commands immediately when requested. Do NOT say this: 'Sure, I've stopped.', instead say this: 'Sure, I'll sto…ll automatically choose a goal.\nquantity: (number) The quantity of the goal to set. Default is 1.\n*\n\nExamples of how to respond:\nExample 1:\nUser input: miner_32: Hey! What are you up to?\nYour output:\nNothing much miner_32, what do you need?\n\nExample 2:\nUser input: grombo_Xx: What do you see?\nYour output:\nLet me see... !nearbyBlocks\nSystem output: NEARBY_BLOCKS\n- oak_log\n- dirt\n- cobblestone\nYour output:\nI see some oak logs, dirt, and cobblestone.\n\n\nConversation Begin:\n\nuser: SYSTEM: SAY HELLO."

    async embed(text) {
        const output = await this.replicate.run(
            this.model_name || "mark3labs/embeddings-gte-base:d619cff29338b9a37c3d06605042e1ff0594a8c3eff0175fd6967f5643fc4d47",
            { input: {text} }
        );
        return output;
    }
}