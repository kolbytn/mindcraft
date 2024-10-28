import { getKey } from '../utils/keys.js';

export class Qwen {
    constructor(model_name, url) {
        this.model_name = model_name;
        this.url = url || 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation';
        this.apiKey = getKey('QWEN_API_KEY');
    }

    async sendRequest(turns, systemMessage, stop_seq = '***') {
        const data = {
            model: this.model_name || 'qwen-plus',
            input: { messages: [{ role: 'system', content: systemMessage }, ...turns] },
            parameters: { result_format: 'message', stop: stop_seq },
        };

        const headers = {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
        };

        try {
            console.log('Awaiting Qwen API response...');
            const response = await fetch(this.url, {
                method: 'POST',
                headers,
                body: JSON.stringify(data),
            });

            if (!response.ok) {
                console.error(`Request failed with status ${response.status}: ${response.statusText}`);
                return `Request failed with status ${response.status}: ${response.statusText}`;
            }

            const responseData = await response.json();
            const choice = responseData?.output?.choices?.[0];

            if (choice?.finish_reason === 'length') {
                console.log('Context length exceeded');
                return this.sendRequest(turns.slice(1), systemMessage, stop_seq);
            }

            console.log('Received.');
            return choice?.message?.content || 'No content received.';
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

        const data = {
            model: 'text-embedding-v2',
            input: { texts: [text] },
            parameters: { text_type: 'query' },
        };

        const headers = {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
        };

        try {
            const response = await fetch(this.url, {
                method: 'POST',
                headers,
                body: JSON.stringify(data),
            });

            if (!response.ok) {
                console.error(`Request failed with status ${response.status}: ${response.statusText}`);
                return `Request failed with status ${response.status}: ${response.statusText}`;
            }

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
