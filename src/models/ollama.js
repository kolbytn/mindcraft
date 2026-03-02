import { strictFormat } from '../utils/text.js';
import http from 'node:http';
import https from 'node:https';

export class Ollama {
    static prefix = 'ollama';
    constructor(model_name, url, params) {
        this.model_name = model_name;
        this.params = params;
        this.url = url || 'http://127.0.0.1:11434';
        this.chat_endpoint = '/api/chat';
        this.embedding_endpoint = '/api/embeddings';
    }

    async sendRequest(turns, systemMessage) {
        let model = this.model_name || 'sweaterdog/andy-4:micro-q8_0';
        let messages = strictFormat(turns);
        messages.unshift({ role: 'system', content: systemMessage });
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
                    this._lastUsage = {
                        prompt_tokens: apiResponse.prompt_eval_count || 0,
                        completion_tokens: apiResponse.eval_count || 0,
                        total_tokens: (apiResponse.prompt_eval_count || 0) + (apiResponse.eval_count || 0),
                    };
                } else {
                    res = 'No response data.';
                    this._lastUsage = null;
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
        return finalRes;
    }

    async embed(text) {
        let model = this.model_name || 'embeddinggemma';
        let body = { model: model, input: text };
        let res = await this.send(this.embedding_endpoint, body);
        return res['embedding'];
    }

    async send(endpoint, body) {
        const url = new URL(endpoint, this.url);
        const bodyStr = JSON.stringify(body);
        const client = url.protocol === 'https:' ? https : http;
        let data = null;
        try {
            data = await new Promise((resolve, reject) => {
                const req = client.request({
                    hostname: url.hostname,
                    port: url.port || (url.protocol === 'https:' ? 443 : 11434),
                    path: url.pathname,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(bodyStr),
                    },
                    timeout: 90000, // 90s timeout for local model responses
                }, (res) => {
                    if (res.statusCode < 200 || res.statusCode >= 300) {
                        res.resume();
                        return reject(new Error(`Ollama Status: ${res.statusCode}`));
                    }
                    let raw = '';
                    res.on('data', chunk => raw += chunk);
                    res.on('end', () => {
                        try { resolve(JSON.parse(raw)); }
                        catch { reject(new Error(`Ollama parse error: ${raw.slice(0, 200)}`)); }
                    });
                });
                req.on('error', reject);
                req.on('timeout', () => { req.destroy(new Error('Ollama request timed out')); });
                req.write(bodyStr);
                req.end();
            });
        } catch (err) {
            console.error('Failed to send Ollama request.');
            console.error(err);
        }
        return data;
    }

    async sendVisionRequest(messages, systemMessage, imageBuffer) {
        // Ollama uses its own image format: { role, content, images: [base64] }
        let model = this.model_name || 'llava';
        let formatted = strictFormat(messages);
        formatted.unshift({ role: 'system', content: systemMessage });
        // Append the vision request with image in Ollama's native format
        formatted.push({
            role: 'user',
            content: systemMessage,
            images: [imageBuffer.toString('base64')]
        });

        console.log(`Awaiting vision response... (model: ${model})`);
        let res = null;
        try {
            let apiResponse = await this.send(this.chat_endpoint, {
                model: model,
                messages: formatted,
                stream: false,
                ...(this.params || {})
            });
            if (apiResponse) {
                res = apiResponse['message']['content'];
            } else {
                res = 'Vision model returned no response.';
            }
        } catch (err) {
            console.log('Vision request error:', err);
            res = 'Vision failed, try again.';
        }
        return res;
    }
}
