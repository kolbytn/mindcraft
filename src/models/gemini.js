import { GoogleGenerativeAI } from '@google/generative-ai';

export class Gemini {
    constructor(model_name) {
        if (!process.env.GEMINI_API_KEY) {
            throw new Error('Gemini API key missing! Make sure you set your GEMINI_API_KEY environment variable.');
        }
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

        this.model = this.genAI.getGenerativeModel({ model: model_name });
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