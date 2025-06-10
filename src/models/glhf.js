import OpenAIApi from 'openai';
import { getKey } from '../utils/keys.js';
import { log, logVision } from '../../logger.js';

export class GLHF {
    constructor(model_name, url) {
        this.model_name = model_name;
        const apiKey = getKey('GHLF_API_KEY');
        if (!apiKey) {
            throw new Error('API key not found. Please check keys.json and ensure GHLF_API_KEY is defined.');
        }
        this.openai = new OpenAIApi({
            apiKey,
            baseURL: url || "https://glhf.chat/api/openai/v1"
        });
        // Direct image data in sendRequest is not supported by this wrapper.
        // Specific vision models/methods should be used if available through the service.
        this.supportsRawImageInput = false;
    }

    async sendRequest(turns, systemMessage, imageData = null, stop_seq = '***') {
        if (imageData) {
            console.warn(`[GLHF] Warning: imageData provided to sendRequest, but this method in glhf.js does not support direct image data embedding for model ${this.model_name}. The image will be ignored.`);
        }
        // Construct the message array for the API request.
        let messages = [{ role: 'system', content: systemMessage }].concat(turns);
        const pack = {
            model: this.model_name || "hf:meta-llama/Llama-3.1-405B-Instruct",
            messages,
            stop: [stop_seq]
        };

        const maxAttempts = 5;
        let attempt = 0;
        let finalRes = null;

        while (attempt < maxAttempts) {
            attempt++;
            console.log(`Awaiting glhf.chat API response... (attempt: ${attempt})`);
            try {
                let completion = await this.openai.chat.completions.create(pack);
                if (completion.choices[0].finish_reason === 'length') {
                    throw new Error('Context length exceeded');
                }
                let res = completion.choices[0].message.content;
                // If there's an open <think> tag without a corresponding </think>, retry.
                if (res.includes("<think>") && !res.includes("</think>")) {
                    console.warn("Partial <think> block detected. Re-generating...");
                    continue;
                }
                // If there's a closing </think> tag but no opening <think>, prepend one.

                if (res.includes("</think>") && !res.includes("<think>")) {
                    res = "<think>" + res;
                }
                finalRes = res.replace(/<\|separator\|>/g, '*no response*');
                break; // Valid response obtained.
              
            } catch (err) {
                if ((err.message === 'Context length exceeded' || err.code === 'context_length_exceeded') && turns.length > 1) {
                    console.log('Context length exceeded, trying again with shorter context.');
                    // Pass imageData along in recursive call, though it will be ignored again
                    return await this.sendRequest(turns.slice(1), systemMessage, imageData, stop_seq);
                } else {
                    console.error(err);
                    finalRes = 'My brain disconnected, try again.';
                    break;
                }
            }
        }
        if (finalRes === null) {
            finalRes = "I thought too hard, sorry, try again";
        }

        if (typeof finalRes === 'string') {
            finalRes = finalRes.replace(/<thinking>/g, '<think>').replace(/<\/thinking>/g, '</think>');
        }
        log(JSON.stringify([{ role: 'system', content: systemMessage }].concat(turns)), finalRes);
        return finalRes;
    }

    async embed(text) {
        throw new Error('Embeddings are not supported by glhf.');
    }
}
