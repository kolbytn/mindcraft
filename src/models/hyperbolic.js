import { getKey } from '../utils/keys.js';

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

        while (attempt < maxAttempts) {
            attempt++;
            console.log(`Awaiting Hyperbolic API response... (attempt: ${attempt})`);
            // console.log('Messages:', messages); // Avoid logging full messages in production if sensitive

            let completionContent = null;

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

                const data = await response.json();
                if (data?.choices?.[0]?.finish_reason === 'length') {
                    throw new Error('Context length exceeded');
                }

                completionContent = data?.choices?.[0]?.message?.content || '';
                console.log('Received response from Hyperbolic.');
            } catch (err) {
                if (
                    (err.message.includes('Context length exceeded') || err.code === 'context_length_exceeded') && // Adjusted to check includes for message
                    turns.length > 1
                ) {
                    console.log('Context length exceeded, trying again with a shorter context...');
                    return await this.sendRequest(turns.slice(1), systemMessage, imageData, stopSeq); // Pass imageData
                } else {
                    console.error(err);
                    completionContent = 'My brain disconnected, try again.';
                    // No break here, let it be set and then break after the think block logic
                }
            }

            const hasOpenTag = completionContent.includes("<think>");
            const hasCloseTag = completionContent.includes("</think>");

            if ((hasOpenTag && !hasCloseTag)) {
                console.warn("Partial <think> block detected. Re-generating...");
                if (attempt >= maxAttempts) { // If this was the last attempt
                    finalRes = "I thought too hard and got stuck in a loop, sorry, try again.";
                    break;
                }
                continue;
            }

            if (hasCloseTag && !hasOpenTag) {
                completionContent = '<think>' + completionContent;
            }

            if (hasOpenTag && hasCloseTag) {
                completionContent = completionContent.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
            }

            finalRes = completionContent.replace(/<\|separator\|>/g, '*no response*');
            break;
        }

        if (finalRes == null) { // This condition might be hit if all attempts fail and continue
            console.warn("Could not get a valid <think> block or normal response after max attempts.");
            finalRes = 'I thought too hard, sorry, try again.';
        }
        return finalRes;
    }

    async embed(text) {
        throw new Error('Embeddings are not supported by Hyperbolic.');
    }
}
