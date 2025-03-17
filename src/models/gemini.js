import { GoogleGenerativeAI } from '@google/generative-ai';
import { toSinglePrompt, strictFormat } from '../utils/text.js';
import { getKey } from '../utils/keys.js';

export class Gemini {
    constructor(model_name, url, params) {
        this.model_name = model_name;
        this.params = params;
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
        const modelConfig = {
            model: this.model_name || "gemini-1.5-flash",
            // systemInstruction does not work bc google is trash
        };
        if (this.url) {
            model = this.genAI.getGenerativeModel(
                modelConfig,
                { baseUrl: this.url },
                { safetySettings: this.safetySettings }
            );
        } else {
            model = this.genAI.getGenerativeModel(
                modelConfig,
                { safetySettings: this.safetySettings }
            );
        }

        console.log('Awaiting Google API response...');

        turns.unshift({ role: 'system', content: systemMessage });
        turns = strictFormat(turns);
        let contents = [];
        for (let turn of turns) {
            contents.push({
                role: turn.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: turn.content }]
            });
        }

        const result = await model.generateContent({
            contents,
            generationConfig: {
                ...(this.params || {})
            }
        });
        const response = await result.response;
        let text;

        // Handle "thinking" models since they smart 
        if (this.model_name && this.model_name.includes("thinking")) {
            if (
                response.candidates &&
                response.candidates.length > 0 &&
                response.candidates[0].content &&
                response.candidates[0].content.parts &&
                response.candidates[0].content.parts.length > 1
            ) {
                text = response.candidates[0].content.parts[1].text;
            } else {
                console.warn("Unexpected response structure for thinking model:", response);
                text = response.text();
            }
        } else {
            text = response.text();
        }

        console.log('Received.');

        return text;
    }

    async sendVisionRequest(turns, systemMessage, imageBuffer) {
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

        const imagePart = {
            inlineData: {
                data: imageBuffer.toString('base64'),
                mimeType: 'image/jpeg'
            }
        };

        const stop_seq = '***';
        const prompt = toSinglePrompt(turns, systemMessage, stop_seq, 'model');
        let res = null;
        try {
            console.log('Awaiting Google API vision response...');
            const result = await model.generateContent([prompt, imagePart]);
            const response = await result.response;
            const text = response.text();
            console.log('Received.');
            if (!text.includes(stop_seq)) return text;
            const idx = text.indexOf(stop_seq);
            res = text.slice(0, idx);
        } catch (err) {
            console.log(err);
            if (err.message.includes("Image input modality is not enabled for models/")) {
                res = "Vision is only supported by certain models.";
            } else {
                res = "An unexpected error occurred, please try again.";
            }
        }
        return res;
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
