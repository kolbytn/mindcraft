import Anthropic from '@anthropic-ai/sdk';
import { strictFormat } from '../utils/text.js';
import { getKey } from '../utils/keys.js';

export class Claude {
    constructor(parameters) {
        this.model_name = parameters.model_name || "claude-3-sonnet-20240229"; 
        this.temperature = parameters.temperature || 1;
        this.max_tokens = parameters.max_tokens || 2048;

        let config = {};
        let url = parameters.url
        if (url)
            config.baseURL = url;
        
        config.apiKey = getKey('ANTHROPIC_API_KEY');

        this.anthropic = new Anthropic(config);
    }

    async sendRequest(turns, systemMessage) {
        const messages = strictFormat(turns);

        const pack = {
            model: this.model_name,
            system: systemMessage,
            messages: messages,
            max_tokens: this.max_tokens,
            temperature: this.temperature
        };

        let res = null;
        try {
            console.log('Awaiting anthropic api response...')
            // console.log('Messages:', messages);
            const resp = await this.anthropic.messages.create(pack);
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



