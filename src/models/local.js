import { strictFormat } from '../utils/text.js';

export class Local {
    constructor(model_name, url, params) {
        this.model_name = model_name;
        this.params = params;
        this.url = url || 'http://127.0.0.1:11434';
        this.chat_endpoint = '/api/chat';
        this.embedding_endpoint = '/api/embeddings';
    }

    async sendRequest(turns, systemMessage) {
        let model = this.model_name || 'llama3.1'; // Updated to llama3.1, as it is more performant than llama3
        let messages = strictFormat(turns);
        messages.unshift({ role: 'system', content: systemMessage });
        
        // We'll attempt up to 5 times for models with deepseek-r1-esk reasoning if the <think> tags are mismatched.
        const maxAttempts = 5;
        let attempt = 0;
        let finalRes = null;

        while (attempt < maxAttempts) {
            attempt++;
            console.log(`Awaiting local response... (model: ${model}, attempt: ${attempt})`);
            let res = null;
            try {
                res = await this.send(this.chat_endpoint, {
                    model: model,
                    messages: messages,
                    stream: false,
                    ...(this.params || {})
                });
                if (res) {
                    res = res['message']['content'];
                } else {
                    res = 'No response data.';
                }
            } catch (err) {
                if (err.message.toLowerCase().includes('context length') && turns.length > 1) {
                    console.log('Context length exceeded, trying again with shorter context.');
                    return await this.sendRequest(turns.slice(1), systemMessage);
                } else {
                    console.log(err);
                    res = 'My brain disconnected, try again.';
                }

            }

            // If the model name includes "deepseek-r1" or "Andy-3.5-reasoning", then handle the <think> block.
                const hasOpenTag = res.includes("<think>");
                const hasCloseTag = res.includes("</think>");

                // If there's a partial mismatch, retry to get a complete response.
                if ((hasOpenTag && !hasCloseTag)) {
                    console.warn("Partial <think> block detected. Re-generating...");
                    continue; 
                }
            
                // If </think> is present but <think> is not, prepend <think>
                if (hasCloseTag && !hasOpenTag) {
                    res = '<think>' + res;
                }
                // Changed this so if the model reasons, using <think> and </think> but doesn't start the message with <think>, <think> ges prepended to the message so no error occur.
            
                // If both tags appear, remove them (and everything inside).
                if (hasOpenTag && hasCloseTag) {
                    res = res.replace(/<think>[\s\S]*?<\/think>/g, '');
                }

            finalRes = res;
            break; // Exit the loop if we got a valid response.
        }

        if (finalRes == null) {
            console.warn("Could not get a valid <think> block or normal response after max attempts.");
            finalRes = 'I thought too hard, sorry, try again.';
        }
        return finalRes;
    }

    async embed(text) {
        let model = this.model_name || 'nomic-embed-text';
        let body = { model: model, input: text };
        let res = await this.send(this.embedding_endpoint, body);
        return res['embedding'];
    }

    async send(endpoint, body) {
        const url = new URL(endpoint, this.url);
        let method = 'POST';
        let headers = new Headers();
        const request = new Request(url, { method, headers, body: JSON.stringify(body) });
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
        }
        return data;
    }
}
