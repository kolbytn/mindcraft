import { GoogleGenerativeAI } from '@google/generative-ai';
import { toSinglePrompt } from '../utils/text.js';
import { getKey } from '../utils/keys.js';

export class Gemini {
    constructor(model_name, url) {
        this.model_name = model_name;
        this.url = url;
        this.safetySettings = [
            {
                "category": "HARM_CATEGORY_DANGEROUS",
                "threshold": "BLOCK_NONE",
            },
            {
                "category": "HARM_CATEGORY_HARASSMENT",
                "threshold": "BLOCK_NONE",
            },
            {
                "category": "HARM_CATEGORY_HATE_SPEECH",
                "threshold": "BLOCK_NONE",
            },
            {
                "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                "threshold": "BLOCK_NONE",
            },
            {
                "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
                "threshold": "BLOCK_NONE",
            },
        ];

        this.genAI = new GoogleGenerativeAI(getKey('GEMINI_API_KEY'));
    }

    async sendRequest(turns, systemMessage) {
        let model;
        if (this.url) {
            model = this.genAI.getGenerativeModel(
                { model: this.model_name || "gemini-1.5-flash" },
                { baseUrl: this.url },
                { safetySettings: this.safetySettings }
            );
        } else {
            model = this.genAI.getGenerativeModel(
                { model: this.model_name || "gemini-1.5-flash" },
                { safetySettings: this.safetySettings }
            );
        }

        const stop_seq = '***';
        const prompt = toSinglePrompt(turns, systemMessage, stop_seq, 'model');
        console.log('Awaiting Google API response...');
        const result = await model.generateContent(prompt);
        const response = await result.response;

        // got rid of the original method of const text = response.text to allow gemini thinking models to play minecraft :)
        let text;
        if (this.model_name && this.model_name.includes("thinking")) {
            if (response.candidates && response.candidates.length > 0 && response.candidates[0].content && response.candidates[0].content.parts && response.candidates[0].content.parts.length > 1) {

                text = response.candidates[0].content.parts[1].text;

            } else {

                console.warn("Unexpected response structure for thinking model:", response);
                text = response.text(); 
            }
        } else {

            text = response.text();

        }



        console.log('Received.');
        if (!text.includes(stop_seq)) return text;
        const idx = text.indexOf(stop_seq);
        return text.slice(0, idx);
    }

    async embed(text) {
        let model;
        if (this.url) {
            model = this.genAI.getGenerativeModel(
                { model: "text-embedding-004" },
                { baseUrl: this.url }
            );
        } else {
            model = this.genAI.getGenerativeModel(
                { model: "text-embedding-004" }
            );
        }

        const result = await model.embedContent(text);
        return result.embedding.values;
    }
}