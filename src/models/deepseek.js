import { getKey } from '../utils/keys.js';
import { OpenAICompatibleChat } from './openai_compatible.js';

export class DeepSeek extends OpenAICompatibleChat {
    static prefix = 'deepseek';

    constructor(model_name, url, params) {
        super({
            model_name,
            url,
            params,
            apiKey: getKey('DEEPSEEK_API_KEY'),
            defaultURL: 'https://api.deepseek.com',
            defaultModel: 'deepseek-chat',
            logName: 'DeepSeek',
        });
    }

    async embed(text) {
        throw new Error('Embeddings are not supported by Deepseek.');
    }
}
