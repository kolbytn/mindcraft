import { getKey } from '../utils/keys.js';
import { OpenAICompatibleChat } from './openai_compatible.js';

export class Qwen extends OpenAICompatibleChat {
    static prefix = 'qwen';

    constructor(model_name, url, params) {
        super({
            model_name,
            url,
            params,
            apiKey: getKey('QWEN_API_KEY'),
            defaultURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
            defaultModel: 'qwen-plus',
            logName: 'Qwen',
        });
    }

    // Why random backoff?
    // With a 30 requests/second limit on Alibaba Qwen's embedding service,
    // random backoff helps maximize bandwidth utilization.
    async embed(text) {
        const maxRetries = 5; // Maximum number of retries
        for (let retries = 0; retries < maxRetries; retries++) {
            try {
                const { data } = await this.openai.embeddings.create({
                    model: this.model_name || 'text-embedding-v3',
                    input: text,
                    encoding_format: 'float',
                });
                return data[0].embedding;
            } catch (err) {
                if (err.status === 429) {
                    // If a rate limit error occurs, calculate the exponential backoff with a random delay (1-5 seconds)
                    const delay = Math.pow(2, retries) * 1000 + Math.floor(Math.random() * 2000);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    throw err;
                }
            }
        }
        throw new Error('Max retries reached, request failed.');
    }
}
