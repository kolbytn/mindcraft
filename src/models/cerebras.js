import CerebrasSDK from '@cerebras/cerebras_cloud_sdk';
import { strictFormat } from '../utils/text.js';
import { getKey } from '../utils/keys.js';

export class Cerebras {
    constructor(model_name, url, params) {
        // Strip the prefix
        this.model_name = model_name.replace('cerebras/', '');
        this.url = url;
        this.params = params;

        // Initialize client with API key
        this.client = new CerebrasSDK({ apiKey: getKey('CEREBRAS_API_KEY') });
    }

    async sendRequest(turns, systemMessage, stop_seq = '***') {
        // Format messages array
        const messages = strictFormat(turns);
        messages.unshift({ role: 'system', content: systemMessage });

        const pack = {
            model: this.model_name || 'llama-4-scout-17b-16e-instruct',
            messages,
            stream: false,
            ...(this.params || {}),
        };

        let res;
        try {
            const completion = await this.client.chat.completions.create(pack);
            // OpenAI-compatible shape
            res = completion.choices?.[0]?.message?.content || '';
        } catch (err) {
            console.error('Cerebras API error:', err);
            res = 'My brain disconnected, try again.';
        }
        return res;
    }

    async embed(text) {
        throw new Error('Embeddings are not supported by Cerebras.');
    }
}
