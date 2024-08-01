import { GoogleGenerativeAI } from '@google/generative-ai';
import { toSinglePrompt } from '../utils/text.js';
import { getKey } from '../utils/keys.js';

export class Gemini {
    constructor(model_name, url, folder="bot_log") {
        this.model_name = model_name;
        this.url = url;

        this.genAI = new GoogleGenerativeAI(getKey('GEMINI_API_KEY'));
    }

    async sendRequest(turns, systemMessage) {
        let model;
        if (this.url) {
            model = this.genAI.getGenerativeModel(
                {model: this.model_name || "gemini-pro"},
                {baseUrl: this.url}
            );
        } else {
            model = this.genAI.getGenerativeModel(
                {model: this.model_name || "gemini-pro"}
            );
        }

        const stop_seq = '***';
        const prompt = toSinglePrompt(turns, systemMessage, stop_seq, 'model');
        console.log('Awaiting Google API response...');
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        this.logChatCompletion(turns, text);
        console.log('Received.');
        if (!text.includes(stop_seq)) return text;
        const idx = text.indexOf(stop_seq);
        return text.slice(0, idx);
    }

    async embed(text) {
        let model;
        if (this.url) {
            model = this.genAI.getGenerativeModel(
                {model: this.model_name || "embedding-001"},
                {baseUrl: this.url}
            );
        } else {
            model = this.genAI.getGenerativeModel(
                {model: this.model_name || "embedding-001"}
            );
        }

        const result = await model.embedContent(text);
        return result.embedding;
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