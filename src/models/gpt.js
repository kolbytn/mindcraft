import OpenAIApi from 'openai';
import { getKey, hasKey } from '../utils/keys.js';
import { strictFormat } from '../utils/text.js';
import { log, logVision } from '../../logger.js';

export class GPT {
    constructor(model_name, url, params) {
        this.model_name = model_name;
        this.params = params;
        let config = {};
        if (url)
            config.baseURL = url;
        if (hasKey('OPENAI_ORG_ID'))
            config.organization = getKey('OPENAI_ORG_ID');
        config.apiKey = getKey('OPENAI_API_KEY');
        this.openai = new OpenAIApi(config);
        this.supportsRawImageInput = true;
    }

    async sendRequest(turns, systemMessage, imageData = null, stop_seq = '***') {
        let messages = [{'role': 'system', 'content': systemMessage}].concat(turns);
        messages = strictFormat(messages);

        if (imageData) {
            const visionModels = ["gpt-4-vision-preview", "gpt-4o", "gpt-4-turbo"];
            if (!visionModels.some(vm => this.model_name.includes(vm))) {
                console.warn(`[GPT] Warning: imageData provided for model ${this.model_name}, which is not explicitly a vision model. The image may be ignored or cause an error.`);
            }

            let lastUserMessageIndex = -1;
            for (let i = messages.length - 1; i >= 0; i--) {
                if (messages[i].role === 'user') {
                    lastUserMessageIndex = i;
                    break;
                }
            }

            if (lastUserMessageIndex !== -1) {
                const originalContent = messages[lastUserMessageIndex].content;
                messages[lastUserMessageIndex].content = [
                    { type: "text", text: originalContent },
                    {
                        type: "image_url",
                        image_url: {
                            url: `data:image/jpeg;base64,${imageData.toString('base64')}`
                        }
                    }
                ];
            } else {
                // No user message to attach image to, log warning or prepend a new one?
                // For now, log a warning. Prompter should ensure user message exists if imagePath is set.
                console.warn('[GPT] imageData provided, but no user message found to attach it to. Image not sent.');
            }
        }

        const pack = {
            model: this.model_name || "gpt-3.5-turbo",
            messages,
            stop: stop_seq,
            ...(this.params || {})
        };
        if (this.model_name.includes('o1')) {
            delete pack.stop;
        }
        let res = null;
        try {

            console.log('Awaiting openai api response from model', this.model_name);

            let completion = await this.openai.chat.completions.create(pack);
            if (completion.choices[0].finish_reason == 'length')
                throw new Error('Context length exceeded');
            console.log('Received.');
            res = completion.choices[0].message.content;
        } catch (err) {
            if ((err.message == 'Context length exceeded' || err.code == 'context_length_exceeded') && turns.length > 1) {
                console.log('Context length exceeded, trying again with shorter context.');
                return await this.sendRequest(turns.slice(1), systemMessage, stop_seq);
            } else if (err.message.includes('image_url')) {
                console.log(err);
                res = 'Vision is only supported by certain models.';
            } else {
                console.log(err);
                res = 'My brain disconnected, try again.';
            }
        }
        if (typeof res === 'string') {
            res = res.replace(/<thinking>/g, '<think>').replace(/<\/thinking>/g, '</think>');
        }

        if (imageData) {
            const conversationForLogVision = [{ role: "system", content: systemMessage }].concat(turns);
            let visionPromptText = "";
            if (turns.length > 0) {
                const lastTurn = turns[turns.length - 1];
                if (lastTurn.role === 'user') {
                    if (typeof lastTurn.content === 'string') {
                        visionPromptText = lastTurn.content;
                    } else if (Array.isArray(lastTurn.content)) {
                        const textPart = lastTurn.content.find(part => part.type === 'text');
                        if (textPart) visionPromptText = textPart.text;
                    }
                }
            }
            logVision(conversationForLogVision, imageData, res, visionPromptText);
        } else {
            log(JSON.stringify([{ role: "system", content: systemMessage }].concat(turns)), res);
        }
        return res;
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
            // The conversationHistory for logVision should be the state *before* this specific vision interaction's prompt was added.
            logVision([{ role: "system", content: systemMessage }].concat(original_turns), imageBuffer, res, systemMessage);
        }
        return res;
    }

    async embed(text) {
        if (text.length > 8191)
            text = text.slice(0, 8191);
        const embedding = await this.openai.embeddings.create({
            model: this.model_name || "text-embedding-3-small",
            input: text,
            encoding_format: "float",
        });
        return embedding.data[0].embedding;
    }
}
