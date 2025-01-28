import Groq from 'groq-sdk';
import { getKey } from '../utils/keys.js';

// Umbrella class for Mixtral, LLama, Gemma...
export class GroqCloudAPI {
    constructor(model_name, url, max_tokens=16384) {
        this.model_name = model_name;
        this.url = url;
        this.max_tokens = max_tokens;

        // ReplicateAPI theft :3
        if (this.url) {
            console.warn("Groq Cloud has no implementation for custom URLs. Ignoring provided URL.");
        }
        this.groq = new Groq({ apiKey: getKey('GROQCLOUD_API_KEY') });
    }

    async sendRequest(turns, systemMessage, stop_seq=null) {
        // We'll do up to 5 attempts for partial <think> mismatch if
        // the model name includes "deepseek-r1".
        const maxAttempts = 5;
        let attempt = 0;
        let finalRes = null;

        // Prepare the message array
        let messages = [{ role: "system", content: systemMessage }].concat(turns);

        while (attempt < maxAttempts) {
            attempt++;
            console.log(`Awaiting Groq response... (attempt: ${attempt}/${maxAttempts})`);

            // Collect the streaming response
            let temp_res = "";
            try {
                // Create the chat completion stream
                let completion = await this.groq.chat.completions.create({
                    messages: messages,
                    model: this.model_name || "mixtral-8x7b-32768",
                    temperature: 0.2,
                    max_tokens: this.max_tokens, 
                    top_p: 1,
                    stream: true,
                    stop: stop_seq // e.g. "***"
                });

                // Read each streamed chunk
                for await (const chunk of completion) {
                    temp_res += chunk.choices[0]?.delta?.content || '';
                }
            } catch (err) {
                console.error("Error while streaming from Groq:", err);
                temp_res = "My brain just kinda stopped working. Try again.";
                // We won't retry partial mismatch if a genuine error occurred here
                finalRes = temp_res;
                break;
            }

            // If the model name includes "deepseek-r1", apply <think> logic
            if (this.model_name && this.model_name.toLowerCase().includes("deepseek-r1")) {
                const hasOpen = temp_res.includes("<think>");
                const hasClose = temp_res.includes("</think>");

                // If partial mismatch, retry
                if ((hasOpen && !hasClose) || (!hasOpen && hasClose)) {
                    console.warn("Partial <think> block detected. Retrying...");
                    continue; 
                }

                // If both <think> and </think> appear, remove the entire block
                if (hasOpen && hasClose) {
                    // Remove everything from <think> to </think>
                    temp_res = temp_res.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
                }
            }

            // We either do not have deepseek-r1 or we have a correct <think> scenario
            finalRes = temp_res;
            break;
        }

        // If, after max attempts, we never set finalRes (e.g., partial mismatch each time)
        if (finalRes == null) {
            console.warn("Could not obtain a valid or matched <think> response after max attempts.");
            finalRes = "Response incomplete, please try again.";
        }
        return finalRes;
    }

    async embed(text) {
        console.log("There is no support for embeddings in Groq support. However, the following text was provided: " + text);
    }
}
