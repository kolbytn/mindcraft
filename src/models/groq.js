// groq.js

import Groq from 'groq-sdk';
import { getKey } from '../utils/keys.js';

/**
 * Umbrella class for Mixtral, LLama, Gemma...
 */
export class GroqCloudAPI {
    constructor(model_name, url, max_tokens = 16384) {
        this.model_name = model_name;
        this.url = url;
        this.max_tokens = max_tokens;

        // Groq Cloud doesn't support custom URLs; warn if provided
        if (this.url) {
            console.warn("Groq Cloud has no implementation for custom URLs. Ignoring provided URL.");
        }

        // Initialize Groq SDK with the API key
        this.groq = new Groq({ apiKey: getKey('GROQCLOUD_API_KEY') });
    }

    /**
     * Sends a chat completion request to the Groq Cloud endpoint.
     *
     * @param {Array} turns - An array of message objects, e.g., [{role: 'user', content: 'Hi'}].
     * @param {string} systemMessage - The system prompt or instruction.
     * @param {string} stop_seq - A string that represents a stopping sequence, default '***'.
     * @returns {Promise<string>} - The content of the model's reply.
     */
    async sendRequest(turns, systemMessage, stop_seq = '***') {
        // Maximum number of attempts to handle partial <think> tag mismatches 5 is a good value, I guess
        const maxAttempts = 5;
        let attempt = 0;
        let finalRes = null;

        // Prepare the input messages by prepending the system message
        const messages = [{ role: 'system', content: systemMessage }, ...turns];
        console.log('Messages:', messages);

        while (attempt < maxAttempts) {
            attempt++;
            console.log(`Awaiting Groq response... (model: ${this.model_name}, attempt: ${attempt})`);

            let res = null;

            try {
                // Create the chat completion request
                const completion = await this.groq.chat.completions.create({
                    messages: messages,
                    model: this.model_name || "mixtral-8x7b-32768",
                    temperature: 0.2,
                    max_tokens: this.max_tokens,
                    top_p: 1,
                    stream: false,
                    stop: stop_seq // "***"
                });

                // Extract the content from the response
                res = completion?.choices?.[0]?.message?.content || '';
                console.log('Received response from Groq.');
            } catch (err) {
                // Handle context length exceeded by retrying with shorter context
            }

            // If the model name includes "deepseek-r1", handle <think> tags
            if (this.model_name && this.model_name.toLowerCase().includes("deepseek-r1")) {
                const hasOpenTag = res.includes("<think>");
                const hasCloseTag = res.includes("</think>");

                // Check for partial <think> tag mismatches
                if ((hasOpenTag && !hasCloseTag)) {
                    console.warn("Partial <think> block detected. Re-generating Groq request...");
                    // Retry the request by continuing the loop
                    continue;
                }

                // If </think> is present but <think> is not, prepend <think>
                if (hasCloseTag && !hasOpenTag) {
                    res = '<think>' + res;
                }
                // Trim the <think> block from the response
                res = res.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
            }

            // Assign the processed response and exit the loop
            finalRes = res;
            break; // Stop retrying
        }

        // If after all attempts, finalRes is still null, assign a fallback
        if (finalRes == null) {
            console.warn("Could not obtain a valid <think> block or normal response after max attempts.");
            finalRes = 'Response incomplete, please try again.';
        }

        finalRes = finalRes.replace(/<\|separator\|>/g, '*no response*');

        return finalRes;
    }

    async embed(text) {
        console.log("There is no support for embeddings in Groq support. However, the following text was provided: " + text);
    }
}
