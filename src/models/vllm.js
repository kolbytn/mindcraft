import OpenAIApi from 'openai';
import { strictFormat } from '../utils/text.js';

export class VLLM {
    static prefix = 'vllm';
    constructor(model_name, url) {
        this.model_name = model_name;

        let config = {};
        config.baseURL = url || 'http://0.0.0.0:8000/v1';
        config.apiKey = '';

        this.vllm = new OpenAIApi(config);
        this._lastUsage = null;
    }

    async sendRequest(turns, systemMessage, stop_seq = '***') {
        let messages = [{ 'role': 'system', 'content': systemMessage }].concat(turns);
        let model = this.model_name || 'google/gemma-3-12b-it';

        if (model.includes('deepseek') || model.includes('qwen')) {
            messages = strictFormat(messages);
        }

        const pack = {
            model: model,
            messages,
            stop: stop_seq,
        };

        const maxAttempts = 5;
        let attempt = 0;
        let finalRes = null;

        while (attempt < maxAttempts) {
            attempt++;
            let res = null;
            try {
                console.log(`Awaiting vLLM response... (model: ${model}, attempt: ${attempt})`);
                let completion = await this.vllm.chat.completions.create(pack);
                if (completion.choices[0].finish_reason == 'length')
                    throw new Error('Context length exceeded');
                console.log('Received.');
                res = completion.choices[0].message.content;

                this._lastUsage = completion.usage ? {
                    prompt_tokens: completion.usage.prompt_tokens || 0,
                    completion_tokens: completion.usage.completion_tokens || 0,
                    total_tokens: completion.usage.total_tokens || 0,
                } : null;
            }
            catch (err) {
                this._lastUsage = null;
                if ((err.message == 'Context length exceeded' || err.code == 'context_length_exceeded') && turns.length > 1) {
                    console.log('Context length exceeded, trying again with shorter context.');
                    return await this.sendRequest(turns.slice(1), systemMessage, stop_seq);
                } else {
                    console.log(err);
                    res = 'My brain disconnected, try again.';
                }
            }

            // Handle <think> tags (Gemma-3 / reasoning models may produce these)
            const hasOpenTag = res.includes('<think>');
            const hasCloseTag = res.includes('</think>');

            if (hasOpenTag && !hasCloseTag) {
                console.warn('Partial <think> block detected. Re-generating...');
                if (attempt < maxAttempts) continue;
            }
            if (hasCloseTag && !hasOpenTag) {
                res = '<think>' + res;
            }
            if (hasOpenTag && hasCloseTag) {
                res = res.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
            }

            finalRes = res;
            break;
        }

        if (finalRes == null) {
            console.warn('Could not get a valid response after max attempts.');
            finalRes = 'I thought too hard, sorry, try again.';
        }
        return finalRes;
    }

    async embed(_text) {
        throw new Error('vLLM embeddings not configured. Use Google gemini-embedding-001 instead.');
    }

    async sendVisionRequest(messages, systemMessage, imageBuffer) {
        const imageMessages = [...messages];
        imageMessages.push({
            role: 'user',
            content: [
                { type: 'text', text: systemMessage },
                {
                    type: 'image_url',
                    image_url: {
                        url: `data:image/jpeg;base64,${imageBuffer.toString('base64')}`
                    }
                }
            ]
        });
        return this.sendRequest(imageMessages, systemMessage);
    }
}
