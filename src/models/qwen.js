import OpenAIApi from 'openai';
import { getKey, hasKey } from '../utils/keys.js';
import { strictFormat } from '../utils/text.js';

import axios from 'axios';

export class Qwen {
    constructor(model_name, url) {
        this.model_name = model_name;
        this.url = url;
        let config = {};
        if (this.url)
            config.baseURL = this.url;

        config.apiKey = getKey('QWEN_API_KEY');

        this.openai = new OpenAIApi(config);
        this.apiKey = config.apiKey;
    }

    async sendRequest(turns, systemMessage, stop_seq = '***') {
        let messages = [{ role: 'system', content: systemMessage }].concat(turns);
        const pack = {
            model: this.model_name || 'qwen-plus',
            messages,
            stop: stop_seq,
        };
        if (this.model_name.includes('o1')) {
            pack.messages = strictFormat(messages);
            delete pack.stop;
        }

        let res = null;
        try {
            console.log('Awaiting Qwen API response...');
            let completion = await this.openai.chat.completions.create(pack);
            if (completion.choices[0].finish_reason == 'length')
                throw new Error('Context length exceeded');
            console.log('Received.');
            res = completion.choices[0].message.content;
        } catch (err) {
            if ((err.message == 'Context length exceeded' || err.code == 'context_length_exceeded') && turns.length > 1) {
                console.log('Context length exceeded, trying again with shorter context.');
                return await this.sendRequest(turns.slice(1), systemMessage, stop_seq);
            } else {
                console.log(err);
                res = 'My brain disconnected, try again.';
            }
        }
        return res;
    }

    async embed(text) {
        if (!text || typeof text !== 'string') {
            console.error('Invalid input for embedding: text must be a non-empty string.');
            return 'Invalid input for embedding: text must be a non-empty string.';
        }
        const headers = {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
        };
        const data = {
            model: 'text-embedding-v2',
            input: {
                texts: [text]
            },
            parameters: {
                text_type: 'query'
            }
        };

        try {
            const response = await axios.post(this.url, data, { headers });
            if (!response || !response.data || !response.data.output || !response.data.output.embeddings) {
                throw new Error('Invalid response from embedding API');
            }
            return response.data.output.embeddings[0].embedding;
        } catch (err) {
            console.error('Error occurred:', err);
            return 'An error occurred while processing your embedding request. Please try again.';
        }
    }
}
