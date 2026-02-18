import OpenAIApi from 'openai';
import { getKey } from '../utils/keys.js';
import { strictFormat } from '../utils/text.js';

export class Nvidia {
    // The prefix will be automatically recognized by _model_map.js
    static prefix = 'nvidia'; 

    constructor(model_name, url, params) {
        // Default to a standard NVIDIA NIM model name if no model_name is provided in the config
        this.model_name = model_name || "meta/llama3-8b-instruct"; 
        this.params = params;

        let config = {};
        // Set NVIDIA's dedicated API endpoint
        config.baseURL = url || 'https://integrate.api.nvidia.com/v1';
        // Set this key in keys.json or as an environment variable
        config.apiKey = getKey('NVIDIA_API_KEY'); 

        this.openai = new OpenAIApi(config);
    }

    async sendRequest(turns, systemMessage, stop_seq='***') {
        let messages = [{'role': 'system', 'content': systemMessage}].concat(turns);
        messages = strictFormat(messages);

        const pack = {
            model: this.model_name,
            messages,
            stop: stop_seq,
            ...(this.params || {})
        };

        try {
            console.log(`Awaiting NVIDIA API (${this.model_name}) response...`);
            let completion = await this.openai.chat.completions.create(pack);
            if (completion.choices[0].finish_reason == 'length')
                throw new Error('Context length exceeded'); 
            console.log('Received.');
            return completion.choices[0].message.content;
        }
        catch (err) {
            if ((err.message == 'Context length exceeded' || err.code == 'context_length_exceeded') && turns.length > 1) {
                console.log('Context length exceeded, trying again with shorter context.');
                return await this.sendRequest(turns.slice(1), systemMessage, stop_seq);
            } else {
                console.error(err);
                return 'My brain disconnected, try again.';
            }
        }
    }

    async embed(text) {
        throw new Error('Embeddings are not supported by this NVIDIA model class yet.');
    }
}