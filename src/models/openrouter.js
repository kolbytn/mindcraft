import OpenAIApi from 'openai';
import { getKey } from '../utils/keys.js';
import { strictFormat } from '../utils/text.js';

export class OpenRouter {
    constructor(model_name, url) {
        this.model_name = model_name.replace('openrouter/', '');
        
        let config = {
            baseURL: url || 'https://openrouter.ai/api/v1',
            defaultHeaders: {
                'HTTP-Referer': 'https://github.com/kolbytn/mindcraft',
                'X-Title': 'Mindcraft' 
            }
        };
        
        config.apiKey = getKey('OPENROUTER_API_KEY');
        this.openai = new OpenAIApi(config);
    }

    async sendRequest(turns, systemMessage, stop_seq='***') {
        let messages = [{'role': 'system', 'content': systemMessage}].concat(turns);
        messages = strictFormat(messages);

        let res = null;
        try {
            console.log('Awaiting OpenRouter response...');
            let completion = await this.openai.chat.completions.create({
                model: this.model_name,
                messages: messages,
                stop: [stop_seq],
            });
            console.log('Received.');
            res = completion.choices[0].message.content;
        }
        catch (err) {
            console.log(err);
            res = 'My brain disconnected, try again.';
        }
        return res;
    }

    async embed(text) {
        throw new Error('Embeddings are not supported by OpenRouter.');
    }
}