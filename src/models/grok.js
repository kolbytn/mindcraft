import OpenAIApi from 'openai';
import { getKey } from '../utils/keys.js';

// xAI doesn't supply a SDK for their models, but fully supports OpenAI and Anthropic SDKs
export class Grok {
    constructor(model_name, url, params) {
        this.model_name = model_name;
        this.url = url;
        this.params = params;

        let config = {};
        if (url)
            config.baseURL = url;
        else
            config.baseURL = "https://api.x.ai/v1"

        config.apiKey = getKey('XAI_API_KEY');

        this.openai = new OpenAIApi(config);
    }

    async sendRequest(turns, systemMessage, stop_seq='***') {
        let messages = [{'role': 'system', 'content': systemMessage}].concat(turns);

        const pack = {
            model: this.model_name || "grok-beta",
            messages,
            stop: [stop_seq],
            ...(this.params || {})
        };

        let res = null;
        try {
            console.log('Awaiting xai api response...')
            ///console.log('Messages:', messages);
            let completion = await this.openai.chat.completions.create(pack);
            if (completion.choices[0].finish_reason == 'length')
                throw new Error('Context length exceeded'); 
            console.log('Received.')
            res = completion.choices[0].message.content;
        }
        catch (err) {
            if ((err.message == 'Context length exceeded' || err.code == 'context_length_exceeded') && turns.length > 1) {
                console.log('Context length exceeded, trying again with shorter context.');
                return await this.sendRequest(turns.slice(1), systemMessage, stop_seq);
            } else {
                console.log(err);
                res = 'My brain disconnected, try again.';
            }
        }
        // sometimes outputs special token <|separator|>, just replace it
        return res.replace(/<\|separator\|>/g, '*no response*');
    }
    
    async embed(text) {
        throw new Error('Embeddings are not supported by Grok.');
    }
}



