import { strictFormat } from '../utils/text.js';
import { log, logVision } from '../../logger.js';

export class Local {
    constructor(model_name, url, params) {
        this.model_name = model_name;
        this.params = params;
        this.url = url || 'http://127.0.0.1:11434';
        this.chat_endpoint = '/api/chat';
        this.embedding_endpoint = '/api/embeddings';
        // Note: Actual multimodal support depends on the specific Ollama model (e.g., LLaVA, BakLLaVA)
        this.supportsRawImageInput = true;
    }

    async sendRequest(turns, systemMessage, imageData = null) {
        let model = this.model_name || 'sweaterdog/andy-4:latest'; // Changed to Andy-4
        let messages = strictFormat(turns);
        messages.unshift({ role: 'system', content: systemMessage });

        if (imageData) {
            console.warn(`[Ollama] imageData provided. Ensure the configured Ollama model ('${model}') is multimodal (e.g., llava, bakllava) to process images.`);
            let lastUserMessageIndex = -1;
            for (let i = messages.length - 1; i >= 0; i--) {
                if (messages[i].role === 'user') {
                    lastUserMessageIndex = i;
                    break;
                }
            }

            if (lastUserMessageIndex !== -1) {
                if (!messages[lastUserMessageIndex].images) {
                    messages[lastUserMessageIndex].images = [];
                }
                messages[lastUserMessageIndex].images.push(imageData.toString('base64'));
            } else {
                console.warn('[Ollama] imageData provided, but no user message found to attach it to. Image not sent.');
                // Or, could create a new user message:
                // messages.push({ role: 'user', content: "Image attached.", images: [imageData.toString('base64')] });
            }
        }
        
        const maxAttempts = 5;
        let attempt = 0;
        let finalRes = null;

        while (attempt < maxAttempts) {
            attempt++;
            console.log(`Awaiting local response... (model: ${model}, attempt: ${attempt})`);
            let res = null;
            try {
                let apiResponse = await this.send(this.chat_endpoint, {
                    model: model,
                    messages: messages,
                    stream: false,
                    ...(this.params || {})
                });
                if (apiResponse) {
                    res = apiResponse['message']['content'];
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

            const hasOpenTag = res.includes("<think>");
            const hasCloseTag = res.includes("</think>");

            if ((hasOpenTag && !hasCloseTag)) {
                console.warn("Partial <think> block detected. Re-generating...");
                if (attempt < maxAttempts) continue;
            }
            if (hasCloseTag && !hasOpenTag) {
                res = '<think>' + res;
            }
            if (hasOpenTag && hasCloseTag) {
                res = res.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
            }
            finalRes = res;
            break;
        }

        if (finalRes == null) {
            console.warn("Could not get a valid response after max attempts.");
            finalRes = 'I thought too hard, sorry, try again.';
        }
        if (typeof finalRes === 'string') {
            finalRes = finalRes.replace(/<thinking>/g, '<think>').replace(/<\/thinking>/g, '</think>');
        }

        if (imageData) { // If imageData was part of this sendRequest call
            // `messages` here already includes the system prompt and image data
            let visionPromptText = "";
            if (messages.length > 0) {
                const lastTurn = messages[messages.length -1];
                 // For Ollama, content is a string, images is a separate array.
                if (lastTurn.role === 'user' && typeof lastTurn.content === 'string') {
                    visionPromptText = lastTurn.content;
                }
            }
            logVision(messages, imageData, finalRes, visionPromptText);
        } else {
            // messages already includes system prompt if no imageData
            log(JSON.stringify(messages), finalRes);
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
