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
    }

    async sendRequest(turns, systemMessage, stop_seq = '***', visionImageBuffer = null, visionMessage = null) {
        // --- PERSONALITY AND REASONING PROMPT HANDLING ---
        let processedSystemMessage = systemMessage;

        let messages = [{ role: 'system', content: processedSystemMessage }, ...turns];
        messages = strictFormat(messages);

        const pack = {
            model: this.model_name,
            messages,
            include_reasoning: true,
            // stop: stop_seq
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

    // Vision request: pass visionImageBuffer and visionMessage
    async sendVisionRequest(turns, systemMessage, imageBuffer, visionMessage = null, stop_seq = '***') {
        return await this.sendRequest(turns, systemMessage, stop_seq, imageBuffer, visionMessage);
    }

    async embed(text) {
        throw new Error('Embeddings are not supported by Openrouter.');
    }
}
