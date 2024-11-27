import {toSinglePrompt} from '../utils/text.js';
import {getKey} from '../utils/keys.js';
import {HfInference} from "@huggingface/inference";

export class HuggingFace {
    constructor(parameters) {
        this.model_name = parameters.model_name.replace('huggingface/','')  || 'meta-llama/Meta-Llama-3-8B';
        this.temperature = parameters.temperature || 0.6;

        this.url = parameters.url;

        if (this.url) {
            console.warn("Hugging Face doesn't support custom urls!");
        }

        this.huggingface = new HfInference(getKey('HUGGINGFACE_API_KEY'));
    }

    async sendRequest(turns, systemMessage) {
        const stop_seq = '***';
        const prompt = toSinglePrompt(turns, null, stop_seq);
        const input = systemMessage + "\n" + prompt;

        const pack = {
            model: this.model_name,
            temperature: this.temperature,
            messages: [{ role: "user", content: input }]
        };

        let res = '';
        try {
            console.log('Awaiting Hugging Face API response...');
            const stream = this.huggingface.chatCompletionStream(pack)
            for await (const chunk of stream) {
                res += (chunk.choices[0]?.delta?.content || "");
            }
        } catch (err) {
            console.log(err);
            res = 'My brain disconnected, try again.';
        }
        console.log('Received.');
        console.log(res);
        return res;
    }

    async embed(text) {
        throw new Error('Embeddings are not supported by HuggingFace.');
    }
}