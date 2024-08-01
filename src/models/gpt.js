import OpenAIApi from 'openai';
import fs from 'fs/promises';
import { getKey, hasKey } from '../utils/keys.js';

class PriorityQueue {
    constructor() {
        this.queue = [];
    }

    enqueue(element, priority) {
        const node = { element, priority };
        this.queue.push(node);
        this.queue.sort((a, b) => a.priority - b.priority);
    }

    dequeue() {
        return this.queue.shift();
    }

    isEmpty() {
        return this.queue.length === 0;
    }
}

export class GPT {
    constructor(model_name, url, folder="bot_log") {
        this.model_name = model_name;
        this.current_requests = 0;
        this.requestQueue = new PriorityQueue();
        this.processing = false;
        this.folder = folder

        let config = {};
        if (url)
            config.baseURL = url;

        if (hasKey('OPENAI_ORG_ID'))
            config.organization = getKey('OPENAI_ORG_ID');

        config.apiKey = getKey('OPENAI_API_KEY');

        this.openai = new OpenAIApi(config);
    }

    async processQueue() {
        if (this.processing) return;
        this.processing = true;

        while (!this.requestQueue.isEmpty()) {
            const { element: { turns, systemMessage, stop_seq, resolve, reject }, priority } = this.requestQueue.dequeue();
            // if it's more than 30 seconds old, don't process it
            if (Date.now() - priority > 30000) {
                console.log('Request is too old, skipping.');
                continue;
            }

            try {
                const result = await this.sendRequestInternal(turns, systemMessage, stop_seq);
                resolve(result);
            } catch (error) {
                reject(error);
            }

            // Wait for 1 second before processing the next request
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        this.processing = false;
    }

    async sendRequest(turns, systemMessage, stop_seq='***') {
        const priority = Date.now(); // Use timestamp as priority
        return new Promise((resolve, reject) => {
            this.requestQueue.enqueue({ turns, systemMessage, stop_seq, resolve, reject }, priority);
            this.processQueue();
        });
    }

    async sendRequestInternal(turns, systemMessage, stop_seq='***') {
        let messages = [{'role': 'system', 'content': systemMessage}].concat(turns);
        
        let res = null;
        try {
            console.log('Awaiting openai api response...');
            await new Promise((resolve) => setTimeout(resolve, 3000));
            console.log("finished waiting 3 seconds, sending request to openai");
            let options = {
                model: this.model_name || "gpt-3.5-turbo",
                messages: messages,
                stop: stop_seq,
            }
            let completion = await this.openai.chat.completions.create(options);
            this.logChatCompletion(messages, completion);
            if (completion.choices[0].finish_reason == 'length')
                throw new Error('Context length exceeded'); 
            console.log('Received.');
            res = completion.choices[0].message.content;
        }
        catch (err) {
            if ((err.message == 'Context length exceeded' || err.code == 'context_length_exceeded') && turns.length > 1) {
                console.log('Context length exceeded, trying again with shorter context.');
                return await this.sendRequestInternal(turns.slice(1), systemMessage, stop_seq);
            } else {
                console.log(err);
                res = 'My brain disconnected, try again.';
            }
        }
        return res;
    }

    async embed(text) {
        const embedding = await this.openai.embeddings.create({
            model: this.model_name || "text-embedding-ada-002",
            input: text,
            encoding_format: "float",
        });
        return embedding.data[0].embedding;
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