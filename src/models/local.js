import { strictFormat } from '../utils/text.js';

export class Local {
    constructor(model_name, url) {
        this.model_name = model_name;
        this.url = url || 'http://127.0.0.1:11434';
        this.chat_endpoint = '/api/chat';
        this.embedding_endpoint = '/api/embeddings';
    }

    /**
     * Main method to handle chat requests.
     */
    async sendRequest(turns, systemMessage) {
        // Choose the model name or default to 'llama3'
        const model = this.model_name || 'llama3';

        // Format messages and inject the system message at the front
        let messages = strictFormat(turns);
        messages.unshift({ role: 'system', content: systemMessage });
        console.log('Messages:', messages);

        // We'll do up to 5 attempts for "deepseek-r1" if the <think> tags are mismatched
        const maxAttempts = 5;
        let attempt = 0;
        let finalRes = null;

        while (attempt < maxAttempts) {
            attempt++;
            console.log(`Awaiting local response... (model: ${model}, attempt: ${attempt})`);

            // Perform the actual request (wrapped in a try/catch)
            let res;
            try {
                const responseData = await this.send(this.chat_endpoint, {
                    model: model,
                    messages: messages,
                    stream: false
                });
                // The local endpoint apparently returns { message: { content: "..." } }
                res = responseData?.message?.content || 'No response data.';
            } catch (err) {
                // If context length exceeded and we have turns to remove, try again with one fewer turn
                if (err.message.toLowerCase().includes('context length') && turns.length > 1) {
                    console.log('Context length exceeded, trying again with shorter context.');
                    return await this.sendRequest(turns.slice(1), systemMessage);
                } else {
                    console.log(err);
                    res = 'My brain disconnected, try again.';
                }
            }

            // If the model name includes "deepseek-r1", then we handle the <think> block
            if (this.model_name && this.model_name.includes("deepseek-r1")) {
                const hasOpenTag = res.includes("<think>");
                const hasCloseTag = res.includes("</think>");

                // If there's a partial mismatch, we regenerate the response
                if ((hasOpenTag && !hasCloseTag) || (!hasOpenTag && hasCloseTag)) {
                    console.warn("Partial <think> block detected. Re-generating...");
                    // Attempt another loop iteration to get a complete or no-think response
                    continue; 
                }

                // If both tags appear, remove them (and everything inside)
                if (hasOpenTag && hasCloseTag) {
                    res = res.replace(/<think>[\s\S]*?<\/think>/g, '');
                }
            }

            // We made it here with either a fully valid or not-needed to handle <think> scenario
            finalRes = res;
            break; // Break out of the while loop
        }

        // If after max attempts we STILL have partial tags, finalRes might be partial
        // Or we never set finalRes because all attempts threw partial tags
        if (finalRes == null) {
            // This means we kept continuing in the loop but never got a break
            console.warn("Could not get a valid <think> block or normal response after max attempts.");
            finalRes = 'Response incomplete, please try again.';
        }
        return finalRes;
    }

    /**
     * Embedding method (unchanged).
     */
    async embed(text) {
        let model = this.model_name || 'nomic-embed-text';
        let body = { model: model, prompt: text };
        let res = await this.send(this.embedding_endpoint, body);
        return res['embedding'];
    }

    /**
     * Generic send method for local endpoint.
     */
    async send(endpoint, body) {
        const url = new URL(endpoint, this.url);
        const method = 'POST';
        const headers = new Headers();
        const request = new Request(url, {
            method,
            headers,
            body: JSON.stringify(body)
        });

        let data = null;
        try {
            const res = await fetch(request);
            if (res.ok) {
                data = await res.json();
            } else {
                throw new Error(`Ollama Status: ${res.status}`);
            }
        } catch (err) {
            console.error('Failed to send Ollama request.');
            console.error(err);
            throw err; // rethrow so we can catch it in the calling method
        }
        return data;
    }
}
