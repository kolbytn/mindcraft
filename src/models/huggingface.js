// huggingface.js
import { toSinglePrompt } from '../utils/text.js';
import { getKey } from '../utils/keys.js';
import { HfInference } from "@huggingface/inference";

export class HuggingFace {
    constructor(model_name, url) {
        // Remove 'huggingface/' prefix if present
        this.model_name = model_name.replace('huggingface/', '');
        this.url = url;

        // Hugging Face Inference doesn't currently allow custom base URLs
        if (this.url) {
            console.warn("Hugging Face doesn't support custom urls!");
        }

        // Initialize the HfInference instance
        this.huggingface = new HfInference(getKey('HUGGINGFACE_API_KEY'));
    }

    /**
     * Main method to handle chat requests.
     */
    async sendRequest(turns, systemMessage) {
        const stop_seq = '***';

        // Convert the user's turns and systemMessage into a single prompt string
        const prompt = toSinglePrompt(turns, null, stop_seq);
        // Fallback model if none was provided
        const model_name = this.model_name || 'meta-llama/Meta-Llama-3-8B';

        // Combine system message with the prompt
        const input = systemMessage + "\n" + prompt;

        // We'll collect the streaming response in this variable
        let res = '';
        console.log('Messages:', [{ role: "system", content: systemMessage }, ...turns]);

        // We'll do up to 5 attempts if the model is "DeepSeek-R1" and <think> tags are mismatched
        const maxAttempts = 5;
        let attempt = 0;
        let finalRes = null;

        while (attempt < maxAttempts) {
            attempt++;
            console.log(`Awaiting Hugging Face API response... (model: ${model_name}, attempt: ${attempt})`);

            res = '';
            try {
                // ChatCompletionStream returns an async iterator that we consume chunk by chunk
                for await (const chunk of this.huggingface.chatCompletionStream({
                    model: model_name,
                    messages: [{ role: "user", content: input }]
                })) {
                    // Each chunk may or may not have delta content
                    res += (chunk.choices[0]?.delta?.content || "");
                }
            } catch (err) {
                console.log(err);
                res = 'My brain disconnected, try again.';
                // Exit the loop, as we only want to retry for <think> block mismatches, not other errors
                break;
            }

            // If the model name includes "DeepSeek-R1", then handle <think> blocks
            if (this.model_name && this.model_name.toLowerCase().includes("deepseek-r1")) {
                const hasOpenTag = res.includes("<think>");
                const hasCloseTag = res.includes("</think>");

                // If there's a partial mismatch, attempt to regenerate the entire response
                if ((hasOpenTag && !hasCloseTag) || (!hasOpenTag && hasCloseTag)) {
                    console.warn("Partial <think> block detected. Re-generating...");
                    continue; 
                }

                // If both tags appear, remove them (and everything in between)
                if (hasOpenTag && hasCloseTag) {
                    res = res.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
                }
            }

            // We made it here with either a valid or no-think scenario
            finalRes = res;
            break; // Stop retrying
        }

        // If after max attempts we couldn't get a matched <think> or valid response
        if (finalRes == null) {
            console.warn("Could not get a valid <think> block or normal response after max attempts.");
            finalRes = 'Response incomplete, please try again.';
        }
        console.log('Received.');
        // Return the final (possibly trimmed) response
        return finalRes;
    }
    async embed(text) {
        throw new Error('Embeddings are not supported by HuggingFace.');
    }
}
