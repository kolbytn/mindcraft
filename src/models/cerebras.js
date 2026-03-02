import CerebrasSDK from '@cerebras/cerebras_cloud_sdk';
import { strictFormat } from '../utils/text.js';
import { getKey } from '../utils/keys.js';

export class Cerebras {
    static prefix = 'cerebras';
    constructor(model_name, url, params) {
        this.model_name = model_name;
        this.url = url;
        this.params = params;

        // Initialize client with API key
        this.client = new CerebrasSDK({ apiKey: getKey('CEREBRAS_API_KEY') });
    }

    async sendRequest(turns, systemMessage, _stop_seq = '***') {
        // Format messages array
        const messages = strictFormat(turns);
        messages.unshift({ role: 'system', content: systemMessage });

        const pack = {
            model: this.model_name || 'gpt-oss-120b',
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

    async sendVisionRequest(messages, systemMessage, imageBuffer) {
        const imageMessages = [...messages];
        imageMessages.push({
            role: "user",
            content: [
                { type: "text", text: systemMessage },
                {
                    type: "image_url",
                    image_url: {
                        url: `data:image/jpeg;base64,${imageBuffer.toString('base64')}`
                    }
                }
            ]
        });
        
        return this.sendRequest(imageMessages, systemMessage);
    }
    
    async embed(_text) {
        throw new Error('Embeddings are not supported by Cerebras.');
    }
}
