// This code uses Dashscope and HTTP to ensure the latest support for the Qwen model.
// Qwen is also compatible with the OpenAI API format;

import { getKey } from '../utils/keys.js';

export class Qwen {
    constructor(modelName, url) {
        this.modelName = modelName;
        this.url = url || 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation';
        this.apiKey = getKey('QWEN_API_KEY');
    }

    async sendRequest(turns, systemMessage, stopSeq = '***', retryCount = 0) {
        if (retryCount > 5) {
            console.error('Maximum retry attempts reached.');
            return 'Error: Too many retry attempts.';
        }

        const data = {
            model: this.modelName || 'qwen-plus',
            input: { messages: [{ role: 'system', content: systemMessage }, ...turns] },
            parameters: { result_format: 'message', stop: stopSeq },
        };

        // Add default user message if all messages are 'system' role
        if (turns.every((msg) => msg.role === 'system')) {
            data.input.messages.push({ role: 'user', content: 'hello' });
        }

        if (!data.model || !data.input || !data.input.messages || !data.parameters) {
            console.error('Invalid request data format:', data);
            throw new Error('Invalid request data format.');
        }

        try {
            const response = await this._makeHttpRequest(this.url, data);
            const choice = response?.output?.choices?.[0];

            if (choice?.finish_reason === 'length' && turns.length > 0) {
                return this.sendRequest(turns.slice(1), systemMessage, stopSeq, retryCount + 1);
            }

            return choice?.message?.content || 'No content received.';
        } catch (err) {
            console.error('Error occurred:', err);
            return 'An error occurred, please try again.';
        }
    }

    async embed(text) {
        if (!text || typeof text !== 'string') {
            console.error('Invalid embedding input: text must be a non-empty string.');
            return 'Invalid embedding input: text must be a non-empty string.';
        }

        const data = {
            model: 'text-embedding-v2',
            input: { texts: [text] },
            parameters: { text_type: 'query' },
        };

        if (!data.model || !data.input || !data.input.texts || !data.parameters) {
            console.error('Invalid embedding request data format:', data);
            throw new Error('Invalid embedding request data format.');
        }

        try {
            const response = await this._makeHttpRequest(this.url, data);
            const embedding = response?.output?.embeddings?.[0]?.embedding;
            return embedding || 'No embedding result received.';
        } catch (err) {
            console.error('Error occurred:', err);
            return 'An error occurred, please try again.';
        }
    }

    async _makeHttpRequest(url, data) {
        const headers = {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
        };

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Request failed, status code ${response.status}: ${response.statusText}`);
            console.error('Error response content:', errorText);
            throw new Error(`Request failed, status code ${response.status}: ${response.statusText}`);
        }

        const responseText = await response.text();
        try {
            return JSON.parse(responseText);
        } catch (err) {
            console.error('Failed to parse response JSON:', err);
            throw new Error('Invalid response JSON format.');
        }
    }
}
