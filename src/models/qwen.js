import OpenAIApi from 'openai';
import { getKey, hasKey } from '../utils/keys.js';
import { strictFormat } from '../utils/text.js';
import { log, logVision } from '../../logger.js';

export class Qwen {
    constructor(model_name, url, params) {
        this.model_name = model_name;
        this.params = params;
        let config = {};

        config.baseURL = url || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
        config.apiKey = getKey('QWEN_API_KEY');

        this.openai = new OpenAIApi(config);
        // Note: Actual multimodal support depends on the specific Qwen model (e.g., qwen-vl-plus)
        this.supportsRawImageInput = true;
    }

    async sendRequest(turns, systemMessage, imageData = null, stop_seq = '***') {
        let messages = [{'role': 'system', 'content': systemMessage}].concat(turns);
        messages = strictFormat(messages);

        if (imageData) {
            // Qwen VL models include names like "qwen-vl-plus", "qwen-vl-max", "qwen-vl-chat-v1"
            if (!this.model_name || !this.model_name.toLowerCase().includes('-vl')) {
                console.warn(`[Qwen] Warning: imageData provided for model ${this.model_name}, which does not appear to be a Qwen Vision-Language (VL) model. The image may be ignored or cause an error.`);
            }

            let lastUserMessageIndex = -1;
            for (let i = messages.length - 1; i >= 0; i--) {
                if (messages[i].role === 'user') {
                    lastUserMessageIndex = i;
                    break;
                }
            }

            if (lastUserMessageIndex !== -1) {
                const userMessage = messages[lastUserMessageIndex];
                if (typeof userMessage.content === 'string') { // Ensure content is a string before converting
                    userMessage.content = [
                        { "text": userMessage.content },
                        { "image": `data:image/jpeg;base64,${imageData.toString('base64')}` }
                    ];
                } else if (Array.isArray(userMessage.content)) {
                    // If content is already an array (e.g. from previous image), add new image
                     userMessage.content.push({ "image": `data:image/jpeg;base64,${imageData.toString('base64')}` });
                } else {
                    console.warn('[Qwen] Last user message content is not a string or array. Creating new content array for image.');
                    userMessage.content = [{ "image": `data:image/jpeg;base64,${imageData.toString('base64')}` }];
                }
            } else {
                console.warn('[Qwen] imageData provided, but no user message found to attach it to. Image not sent.');
                // Alternative: Create a new user message with the image
                // messages.push({ role: 'user', content: [{ "image": `data:image/jpeg;base64,${imageData.toString('base64')}` }] });
            }
        }

        const pack = {
            model: this.model_name || "qwen-plus", // Default might need to be a VL model if images are common
            messages,
            stop: stop_seq,
            ...(this.params || {})
        };

        let res = null;
        try {
            console.log('Awaiting Qwen api response...');
            // console.log('Messages:', messages);
            let completion = await this.openai.chat.completions.create(pack);
            if (completion.choices[0].finish_reason == 'length')
                throw new Error('Context length exceeded');
            console.log('Received.');
            res = completion.choices[0].message.content;
        }
        catch (err) {
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
            // `messages` here includes system prompt and image data
            let visionPromptText = "";
             if (messages.length > 0) {
                const lastTurn = messages[messages.length - 1];
                if (lastTurn.role === 'user' && Array.isArray(lastTurn.content)) {
                    const textPart = lastTurn.content.find(part => part.text);
                    if (textPart) visionPromptText = textPart.text;
                } else if (lastTurn.role === 'user' && typeof lastTurn.content === 'string'){
                     visionPromptText = lastTurn.content;
                }
            }
            logVision(messages, imageData, res, visionPromptText);
        } else {
            // messages already includes system prompt if no imageData
            log(JSON.stringify(messages), res);
        }
        return res;
    }

    // Why random backoff?
    // With a 30 requests/second limit on Alibaba Qwen's embedding service,
    // random backoff helps maximize bandwidth utilization.
    async embed(text) {
        const maxRetries = 5; // Maximum number of retries
        for (let retries = 0; retries < maxRetries; retries++) {
            try {
                const { data } = await this.openai.embeddings.create({
                    model: this.model_name || "text-embedding-v3",
                    input: text,
                    encoding_format: "float",
                });
                return data[0].embedding;
            } catch (err) {
                if (err.status === 429) {
                    // If a rate limit error occurs, calculate the exponential backoff with a random delay (1-5 seconds)
                    const delay = Math.pow(2, retries) * 1000 + Math.floor(Math.random() * 2000);
                    // console.log(`Rate limit hit, retrying in ${delay} ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay)); // Wait for the delay before retrying
                } else {
                    throw err;
                }
            }
        }
        // If maximum retries are reached and the request still fails, throw an error
        throw new Error('Max retries reached, request failed.');
    }

}
