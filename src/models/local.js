import { strictFormat } from '../utils/text.js';

export class Local {
    constructor(model_name, url, folder="bot_log") {
        this.model_name = model_name;
        this.url = url || 'http://127.0.0.1:11434';
        this.chat_endpoint = '/api/chat';
        this.embedding_endpoint = '/api/embeddings';
    }

    async sendRequest(turns, systemMessage) {
        let model = this.model_name || 'llama3';
        let messages = strictFormat(turns);
        messages.unshift({role: 'system', content: systemMessage});
        let res = null;
        try {
            console.log(`Awaiting local response... (model: ${model})`)
            res = await this.send(this.chat_endpoint, {model: model, messages: messages, stream: false});
            if (res)
                res = res['message']['content'];
        }
        catch (err) {
            if (err.message.toLowerCase().includes('context length') && turns.length > 1) {
                console.log('Context length exceeded, trying again with shorter context.');
                return await sendRequest(turns.slice(1), systemMessage, stop_seq);
            } else {
                console.log(err);
                res = 'My brain disconnected, try again.';
            }
        }
        return res;
    }

    async embed(text) {
        let model = this.model_name || 'nomic-embed-text';
        let body = {model: model, prompt: text};
        let res = await this.send(this.embedding_endpoint, body);
        return res['embedding']
    }

    async send(endpoint, body) {
        const url = new URL(endpoint, this.url);
        let method = 'POST';
        let headers = new Headers();
        const request = new Request(url, {method, headers, body: JSON.stringify(body)});
        let data = null;
        try {
            const res = await fetch(request);
            if (res.ok) {
                data = await res.json();
                this.logChatCompletion(body.messages, data.message.content);
            } else {
                throw new Error(`Ollama Status: ${res.status}`);
            }
        } catch (err) {
            console.error('Failed to send Ollama request.');
            console.error(err);
        }
        return data;
    }
    async logChatCompletion(messages, completion) {
        // async Log the completion in a session folder in a timestamp.json file
        const timestamp = Date.now();
        // get the day for the folder so that everything from the same day is in the same folder
        const day = new Date(timestamp).toISOString().split('T')[0];
        const folder = `bots/${this.folder}/sessions/${day}`;
        // async check to make sure the folder exists
        await fs.access(folder).catch(() => fs.mkdir(folder, { recursive: true }));
        // async write the log file
        const data = { messages, completion };
        await fs.writeFile(`${folder}/${timestamp}.json`, JSON.stringify(data, null, 2));

        return timestamp;
    }
}