import OpenAIApi from 'openai';
import { getKey, hasKey } from '../utils/keys.js';
import { strictFormat } from '../utils/text.js';

export class Together {
    constructor(model_name, url, params) {
        this.model_name = model_name;
        this.params = params;

        let config = {};
        config.baseURL = url || 'https://api.together.xyz/api/v1';

        const apiKey = getKey('TOGETHER_API_KEY');
        if (!apiKey) {
            console.error('Error: TOGETHER_API_KEY not found. Make sure it is set properly.');
        }

        config.apiKey = apiKey; 

        this.openai = new OpenAIApi(config);
    }

    async sendRequest(turns, systemMessage, stop_seq='*') {
        let messages = [{ role: 'system', content: systemMessage }, ...turns];
        messages = strictFormat(messages);

        const pack = {
            model: this.model_name || "deepseek-ai/DeepSeek-R1-Distill-Llama-70B-free",
            messages,
            stop: stop_seq,
            ...(this.params || {})
        };

        let res = null;
        try {
            console.log('Awaiting together.ai api response...');
            let completion = await this.openai.chat.completions.create(pack);
            if (!completion?.choices?.[0]) {
                console.error('No completion or choices returned:', completion);
                return 'No response received.';
            }
            if (completion.choices[0].finish_reason === 'length') {
                throw new Error('Context length exceeded');
            }
            console.log('Received.');
            res = completion.choices[0].message.content;
        } catch (err) {
            console.error('Error while awaiting response:', err);
            // If the error indicates a context-length problem, we can slice the turns array, etc.
            res = 'My brain disconnected, try again.';
        }
        return res;
    }

    async embed(text) {
        throw new Error('Free embeddings are not supported by Together.');
    }
}
