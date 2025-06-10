import { getKey } from '../utils/keys.js';
import { log, logVision } from '../../logger.js';

export class Hyperbolic {
    constructor(modelName, apiUrl) {
        this.modelName = modelName || "deepseek-ai/DeepSeek-V3";
        this.apiUrl = apiUrl || "https://api.hyperbolic.xyz/v1/chat/completions";

        this.apiKey = getKey('HYPERBOLIC_API_KEY');
        if (!this.apiKey) {
            throw new Error('HYPERBOLIC_API_KEY not found. Check your keys.js file.');
        }

        // Direct image data in sendRequest is not supported by this wrapper.
        this.supportsRawImageInput = false;
    }

    async sendRequest(turns, systemMessage, imageData = null, stopSeq = '***') {
        if (imageData) {
            console.warn(`[Hyperbolic] Warning: imageData provided to sendRequest, but this method in hyperbolic.js does not support direct image data embedding for model ${this.modelName}. The image will be ignored.`);
        }
        const messages = [{ role: 'system', content: systemMessage }, ...turns];

        const payload = {
            model: this.modelName,
            messages: messages,
            max_tokens: 8192,
            temperature: 0.7,
            top_p: 0.9,
            stream: false
            // stop: stopSeq, // Hyperbolic API might not support stop sequences in the same way or at all.
                           // If it does, it might need to be formatted differently or might not be part of standard payload.
                           // For now, commenting out if it causes issues or is not standard.
        };
        if (stopSeq && stopSeq !== '***') { // Only add stop if it's meaningful and not the default placeholder
            payload.stop = stopSeq;
        }


        const maxAttempts = 5;
        let attempt = 0;
        let finalRes = null;
        let rawCompletionContent = null;

        while (attempt < maxAttempts) {
            attempt++;
            console.log(`Awaiting Hyperbolic API response... (attempt: ${attempt})`);

          
            try {
                const response = await fetch(this.apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.apiKey}`
                    },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    // Attempt to read error body for more details
                    let errorBody = "No additional error details.";
                    try {
                        errorBody = await response.text();
                    } catch (e) { /* ignore if error body can't be read */ }
                    throw new Error(`HTTP error! status: ${response.status}, message: ${errorBody}`);
                }

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                if (data?.choices?.[0]?.finish_reason === 'length') {
                    throw new Error('Context length exceeded');
                }

                rawCompletionContent = data?.choices?.[0]?.message?.content || '';
                console.log('Received response from Hyperbolic.');
            } catch (err) {
                if ((err.message === 'Context length exceeded' || err.code === 'context_length_exceeded') && turns.length > 1) {
                    console.log('Context length exceeded, trying again with a shorter context...');
                    return await this.sendRequest(turns.slice(1), systemMessage, imageData, stopSeq);
                } else {
                    console.error(err);
                    rawCompletionContent = 'My brain disconnected, try again.';
                    finalRes = rawCompletionContent;
                    break;
                }
            }

            let processedContent = rawCompletionContent;
            const hasOpenTag = processedContent.includes("<think>");
            const hasCloseTag = processedContent.includes("</think>");

            if ((hasOpenTag && !hasCloseTag)) {
                console.warn("Partial <think> block detected. Re-generating...");
                if (attempt < maxAttempts) continue;
            }
            if (hasCloseTag && !hasOpenTag) {
                processedContent = '<think>' + processedContent;
            }
            if (hasOpenTag && hasCloseTag) {
                processedContent = processedContent.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
            }
            finalRes = processedContent.replace(/<\|separator\|>/g, '*no response*');
            if (!(hasOpenTag && !hasCloseTag && attempt < maxAttempts)) {
                break;
            }
        }

        if (finalRes == null) {
            finalRes = rawCompletionContent || 'I thought too hard, sorry, try again.';
            finalRes = finalRes.replace(/<\|separator\|>/g, '*no response*');
        }

        if (typeof finalRes === 'string') {
            finalRes = finalRes.replace(/<thinking>/g, '<think>').replace(/<\/thinking>/g, '</think>');
        }
        log(JSON.stringify([{ role: 'system', content: systemMessage }].concat(turns)), finalRes);
        return finalRes;
    }

    async embed(text) {
        throw new Error('Embeddings are not supported by Hyperbolic.');
    }
}
