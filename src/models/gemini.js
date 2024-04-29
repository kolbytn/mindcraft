import { GoogleGenerativeAI } from '@google/generative-ai';


export class Gemini {
    constructor(model_name, url) {
        this.model_name = model_name;
        this.url = url;

        if (!process.env.GEMINI_API_KEY) {
            throw new Error('Gemini API key missing! Make sure you set your GEMINI_API_KEY environment variable.');
        }
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    }

    async sendRequest(turns, systemMessage) {
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
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    }

    async embed(text) {
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
}