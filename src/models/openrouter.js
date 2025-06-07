import OpenAIApi from 'openai';
import { getKey, hasKey } from '../utils/keys.js';
import { strictFormat } from '../utils/text.js';
import { log, logVision } from '../../logger.js';

export class OpenRouter {
    constructor(model_name, url) {
        this.model_name = model_name;
        let config = {};
        config.baseURL = url || 'https://openrouter.ai/api/v1';
        const apiKey = getKey('OPENROUTER_API_KEY');
        if (!apiKey) {
            console.error('Error: OPENROUTER_API_KEY not found. Make sure it is set properly.');
        }
        config.apiKey = apiKey;
        this.openai = new OpenAIApi(config);
        // OpenRouter is a router; individual models might support vision.
        // This generic sendRequest does not format for vision. Use sendVisionRequest or specific model logic.
        this.supportsRawImageInput = false;
    }

    async sendRequest(turns, systemMessage, imageData = null, stop_seq='*') {
        if (imageData) {
            console.warn(`[OpenRouter] Warning: imageData provided to sendRequest. While OpenRouter can route to vision models, this generic method does not format for image data. The image will be ignored. Use sendVisionRequest or ensure your model call through OpenRouter is specifically formatted for vision if needed.`);
        }
        let messages = [{ role: 'system', content: systemMessage }, ...turns];
        messages = strictFormat(messages);

        const pack = {
            model: this.model_name,
            messages,
            include_reasoning: true,
            // stop: stop_seq // Commented out since some API providers on Openrouter do not support a stop sequence, such as Grok 3
        };

        const maxAttempts = 5;
        let attempt = 0;
        let finalRes = null;

        while (attempt < maxAttempts) {
            attempt++;
            console.info(`Awaiting openrouter API response... (attempt: ${attempt})`);
            let res = null;
            try {
                let completion = await this.openai.chat.completions.create(pack);
                if (!completion?.choices?.[0]) {
                    console.error('No completion or choices returned:', completion);
                    return 'No response received.';
                }

                const logMessages = [{ role: "system", content: processedSystemMessage }].concat(turns);

                if (completion.choices[0].finish_reason === 'length') {
                    throw new Error('Context length exceeded');
                }
                
                if (completion.choices[0].message.reasoning) {
                    try{
                        const reasoning = '<think>\n' + completion.choices[0].message.reasoning + '</think>\n';
                        const content = completion.choices[0].message.content;

                        // --- VISION LOGGING ---
                        if (visionImageBuffer) {
                            logVision(turns, visionImageBuffer, reasoning + "\n" + content, visionMessage);
                        } else {
                            log(JSON.stringify(logMessages), reasoning + "\n" + content);
                        }
                        res = content;
                    } catch {}
                } else {
                    try {
                        res = completion.choices[0].message.content;
                        if (visionImageBuffer) {
                            logVision(turns, visionImageBuffer, res, visionMessage);
                        } else {
                            log(JSON.stringify(logMessages), res);
                        }
                    } catch {
                        console.warn("Unable to log due to unknown error!");
                    }
                }
                // Trim <think> blocks from the final response if present.
                if (res && res.includes("<think>") && res.includes("</think>")) {
                    res = res.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
                }

                console.info('Received.');
            } catch (err) {
                console.error('Error while awaiting response:', err);
                res = 'My brain disconnected, try again.';
            }

            finalRes = res;
            break; // Exit loop once a valid response is obtained.
        }

        if (finalRes == null) {
            console.warn("Could not get a valid <think> block or normal response after max attempts.");
            finalRes = 'I thought too hard, sorry, try again.';
        }
        return finalRes;
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
        
        // sendVisionRequest formats its own message array; sendRequest here should not process new imageData.
        // Pass systemMessage and stop_seq as originally intended by sendRequest.
        return this.sendRequest(imageMessages, systemMessage, null, stop_seq);

    }

    async embed(text) {
        throw new Error('Embeddings are not supported by Openrouter.');
    }
}
