import Anthropic from '@anthropic-ai/sdk';


export class Claude {
    constructor(model_name, url) {
        this.model_name = model_name;

        let config = {};
        if (url)
            config.baseURL = url;
        if (process.env.ANTHROPIC_API_KEY)
            config.apiKey = process.env["ANTHROPIC_API_KEY"];
        else
            throw new Error('Anthropic API key missing! Make sure you set your ANTHROPIC_API_KEY environment variable.');

        this.anthropic = new Anthropic(config);
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
        if (messages.length > 0 && messages[0].role !== 'user') {
            messages.unshift(filler); // anthropic requires user message to start
        }
        if (messages.length === 0) {
            messages.push(filler);
        }
        
        let res = null;
        try {
            console.log('Awaiting anthropic api response...')
            console.log('Messages:', messages);
            const resp = await this.anthropic.messages.create({
                model: this.model_name || "claude-3-sonnet-20240229",
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
        throw new Error('Embeddings are not supported by Claude.');
    }
}



