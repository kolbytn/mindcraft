import OpenAIApi from 'openai';
import { getKey } from '../utils/keys.js';
import { log, logVision } from '../../logger.js';

// xAI doesn't supply a SDK for their models, but fully supports OpenAI and Anthropic SDKs
export class Grok {
    constructor(model_name, url, params) {
        this.model_name = model_name;
        this.url = url;
        this.params = params;
        let config = {};
        if (url)
            config.baseURL = url;
        else
            config.baseURL = "https://api.x.ai/v1"
        config.apiKey = getKey('XAI_API_KEY');
        this.openai = new OpenAIApi(config);
        // Direct image data in sendRequest is not supported by this wrapper for standard chat.
        // Grok may have specific vision capabilities, but this method assumes text-only.
        this.supportsRawImageInput = false;
    }

    async sendRequest(turns, systemMessage, imageData = null, stop_seq='***') {
        if (imageData) {
            console.warn(`[Grok] Warning: imageData provided to sendRequest, but this method in grok.js does not support direct image data embedding for model ${this.model_name}. The image will be ignored.`);
        }
        let messages = [{'role': 'system', 'content': systemMessage}].concat(turns);
        const pack = {
            model: this.model_name || "grok-beta",
            messages,
            stop: [stop_seq],
            ...(this.params || {})
        };
        let res = null;
        try {
            console.log('Awaiting xai api response...')
            let completion = await this.openai.chat.completions.create(pack);
            if (completion.choices[0].finish_reason == 'length')
                throw new Error('Context length exceeded'); 
            console.log('Received.')
            res = completion.choices[0].message.content;
        } catch (err) {
            if ((err.message == 'Context length exceeded' || err.code == 'context_length_exceeded') && turns.length > 1) {
                console.log('Context length exceeded, trying again with shorter context.');
                return await this.sendRequest(turns.slice(1), systemMessage, imageData, stop_seq);
            } else if (err.message.includes('The model expects a single `text` element per message.')) {
                console.log(err);
                res = 'Vision is only supported by certain models.';
            } else {
                console.log(err);
                res = 'My brain disconnected, try again.';
            }
        }
        // sometimes outputs special token <|separator|>, just replace it
        let finalResponseText = res ? res.replace(/<\|separator\|>/g, '*no response*') : (res === null ? "*no response*" : res);
        if (typeof finalResponseText === 'string') {
            finalResponseText = finalResponseText.replace(/<thinking>/g, '<think>').replace(/<\/thinking>/g, '</think>');
        }
        log(JSON.stringify([{ role: "system", content: systemMessage }].concat(turns)), finalResponseText);
        return finalResponseText;
    }

    async sendVisionRequest(original_turns, systemMessage, imageBuffer) {
        const imageFormattedTurns = [...original_turns];
        imageFormattedTurns.push({
            role: "user",
            content: [
                { type: "text", text: systemMessage },
                {
                    type: "image_url",
                    image_url: { url: `data:image/jpeg;base64,${imageBuffer.toString('base64')}` }
                }
            ]
        });
        
        const res = await this.sendRequest(imageFormattedTurns, systemMessage);

        if (imageBuffer && res) {
            logVision([{ role: "system", content: systemMessage }].concat(original_turns), imageBuffer, res, systemMessage);
        }
        return res;
    }
    
    async embed(text) {
        throw new Error('Embeddings are not supported by Grok.');
    }
}
