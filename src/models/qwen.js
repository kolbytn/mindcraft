import OpenAIApi from 'openai';
import { getKey } from '../utils/keys.js';
import { strictFormat } from '../utils/text.js';

export class Qwen {
    constructor(model_name, url) {
        this.model_name = model_name;
        this.url = url;

        const config = {
            baseURL: this.url,
            apiKey: getKey('QWEN_API_KEY'),
        };

        this.openai = new OpenAIApi(config);
        this.apiKey = config.apiKey;
    }

    async sendRequest(turns, systemMessage, stop_seq = '***') {
        const messages = [{ role: 'system', content: systemMessage }, ...turns];
        const pack = {
            model: this.model_name || 'qwen-plus',
            messages: this.model_name.includes('o1') ? strictFormat(messages) : messages,
            stop: this.model_name.includes('o1') ? undefined : stop_seq,
        };

        try {
            console.log('Awaiting Qwen API response...');
            const completion = await this.openai.chat.completions.create(pack);
            const choice = completion.choices[0];

            if (choice.finish_reason === 'length') {
                console.log('Context length exceeded');
                return await this.sendRequest(turns.slice(1), systemMessage, stop_seq);
            }
            console.log('Received.');
            return choice.message.content;
        } catch (err) {
            console.error('Error occurred:', err);
            return 'My brain disconnected, try again.';
        }
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
            input: { texts: [text] },
            parameters: { text_type: 'query' }
        };

        try {
            const response = await fetch(this.url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(data)
            });
            const responseData = await response.json();

            if (!responseData?.output?.embeddings) {
                console.error('Invalid response from embedding API');
                return 'An error occurred while processing your embedding request. Please try again.';
            }
            return responseData.output.embeddings[0].embedding;
        } catch (err) {
            console.error('Error occurred:', err);
            return 'An error occurred while processing your embedding request. Please try again.';
        }
    }
}
