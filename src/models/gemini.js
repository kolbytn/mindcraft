import { GoogleGenerativeAI } from '@google/generative-ai';
import { toSinglePrompt } from '../utils/text.js';
import { getKey } from '../utils/keys.js';

export class Gemini {
    constructor(parameters) {
        this.model_name = parameters.model_name || "gemini-1.5-flash";
        this.temperature = parameters.temperature || 1;
        this.max_tokens = parameters.max_tokens || 1000;

        this.url = parameters.url;
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

    async sendRequest(turns, systemMessage, stop_seq='***') {
        let model;
        const pack = [
            { model: this.model_name },
            { generationConfig: {
                maxOutputTokens: this.max_tokens,
                temperature: this.temperature,
                stopSequences: [stop_seq]
            }},
            { safetySettings: this.safetySettings },
            { baseUrl: this.url },
        ];
        model = this.genAI.getGenerativeModel(...pack);
;
        const prompt = toSinglePrompt(turns, systemMessage, stop_seq, 'model');
        console.log('Awaiting Google API response...');
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
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