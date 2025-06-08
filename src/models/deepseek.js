import OpenAIApi from 'openai';
import { getKey, hasKey } from '../utils/keys.js';
import { strictFormat } from '../utils/text.js';
import { log, logVision } from '../../logger.js';

export class DeepSeek {
    constructor(model_name, url, params) {
        this.model_name = model_name;
        this.params = params;
        let config = {};
        config.baseURL = url || 'https://api.deepseek.com';
        config.apiKey = getKey('DEEPSEEK_API_KEY');
        this.openai = new OpenAIApi(config);
        this.supportsRawImageInput = true; // Assuming DeepSeek models used can support this OpenAI-like format
    }

    async sendRequest(turns, systemMessage, imageData = null, stop_seq = '***') {
        let messages = [{'role': 'system', 'content': systemMessage}].concat(turns);
        messages = strictFormat(messages);

        if (imageData) {
            console.warn(`[DeepSeek] imageData provided. Ensure the configured DeepSeek model ('${this.model_name || "deepseek-chat"}') is vision-capable.`);

            let lastUserMessageIndex = -1;
            for (let i = messages.length - 1; i >= 0; i--) {
                if (messages[i].role === 'user') {
                    lastUserMessageIndex = i;
                    break;
                }
            }

            if (lastUserMessageIndex !== -1) {
                const userMessage = messages[lastUserMessageIndex];
                const originalContent = userMessage.content; // Should be a string

                if (typeof originalContent === 'string') {
                    userMessage.content = [
                        { type: "text", text: originalContent },
                        {
                            type: "image_url",
                            image_url: {
                                url: `data:image/jpeg;base64,${imageData.toString('base64')}`
                            }
                        }
                    ];
                } else {
                    // If content is already an array (e.g. from a previous modification or different source)
                    // We'd need a more robust way to handle this, but for now, assume it's a string
                    // or log an error/warning.
                    console.warn('[DeepSeek] Last user message content was not a simple string. Attempting to add image, but structure might be unexpected.');
                    if(Array.isArray(originalContent)) {
                        originalContent.push({
                            type: "image_url",
                            image_url: { url: `data:image/jpeg;base64,${imageData.toString('base64')}` }
                        });
                        userMessage.content = originalContent;
                    } else { // Fallback if it's some other type, just overwrite with new structure
                         userMessage.content = [
                            { type: "text", text: String(originalContent) }, // Attempt to stringify
                            {
                                type: "image_url",
                                image_url: { url: `data:image/jpeg;base64,${imageData.toString('base64')}` }
                            }
                        ];
                    }
                }
            } else {
                console.warn('[DeepSeek] imageData provided, but no user message found to attach it to. Image not sent.');
                // Or: messages.push({ role: 'user', content: [ { type: "image_url", image_url: { url: ... } } ] });
            }
        }

        const pack = {
            model: this.model_name || "deepseek-chat",
            messages,
            stop: stop_seq,
            ...(this.params || {})
        };
        let res = null;
        try {
          
            console.log('Awaiting deepseek api response...')
          
            let completion = await this.openai.chat.completions.create(pack);
            if (completion.choices[0].finish_reason == 'length')
                throw new Error('Context length exceeded');
            console.log('Received.');
            res = completion.choices[0].message.content;
        } catch (err) {
            if ((err.message == 'Context length exceeded' || err.code == 'context_length_exceeded') && turns.length > 1) {
                console.log('Context length exceeded, trying again with shorter context.');
                return await this.sendRequest(turns.slice(1), systemMessage, stop_seq);
            } else {
                console.log(err);
                res = 'My brain disconnected, try again.';
            }
        }
        if (typeof res === 'string') {
            res = res.replace(/<thinking>/g, '<think>').replace(/<\/thinking>/g, '</think>');
        }

        if (imageData) { // If imageData was part of this sendRequest call
            const conversationForLogVision = [{ role: "system", content: systemMessage }].concat(turns);
            let visionPromptText = "";
             if (turns.length > 0) {
                const lastTurn = messages[messages.length - 1]; // `messages` is after image processing
                if (lastTurn.role === 'user' && Array.isArray(lastTurn.content)) {
                    const textPart = lastTurn.content.find(part => part.type === 'text');
                    if (textPart) visionPromptText = textPart.text;
                } else if (lastTurn.role === 'user' && typeof lastTurn.content === 'string') {
                    // This case might not happen if image is added, as content becomes array
                    visionPromptText = lastTurn.content;
                }
            }
            logVision(conversationForLogVision, imageData, res, visionPromptText);
        } else {
            log(JSON.stringify([{ role: "system", content: systemMessage }].concat(turns)), res);
        }
        return res;
    }

    async embed(text) {
        throw new Error('Embeddings are not supported by Deepseek.');
    }
}
