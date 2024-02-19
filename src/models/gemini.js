import { GoogleGenerativeAI } from '@google/generative-ai';
import settings from '../settings.js';

export class Gemini {
    constructor() {
        if (!process.env.GEMINI_API_KEY) {
            console.error('Gemini API key missing! Make sure you set your GEMINI_API_KEY environment variable.');
            process.exit(1);
        }
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

        this.model = this.genAI.getGenerativeModel({ model: settings.model });
    }

    async sendRequest(turns, systemMessage) {
        const messages = [{'role': 'system', 'content': systemMessage}].concat(turns);
        let prompt = "";
        let role = "";
        messages.forEach((message) => {
            role = message.role;
            if (role === 'assistant') role = 'model';
            prompt += `${role}: ${message.content}\n`;
        });
        if (role !== "model") // if the last message was from the user/system, add a prompt for the model. otherwise, pretend we are extending the model's own message
            prompt += "model: ";
        console.log(prompt)
        const result = await this.model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    }

    async embed(text) {
        const model = this.genAI.getGenerativeModel({ model: "embedding-001"});
        const result = await model.embedContent(text);
        return result.embedding;
    }
}