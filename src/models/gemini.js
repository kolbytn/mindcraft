import { GoogleGenerativeAI } from '@google/generative-ai';
import { toSinglePrompt, strictFormat } from '../utils/text.js';
import { getKey } from '../utils/keys.js';
import { log, logVision } from '../../logger.js';

export class Gemini {
    constructor(model_name, url, params) {
        this.model_name = model_name;
        this.params = params;
        this.url = url;
        this.safetySettings = [
            { "category": "HARM_CATEGORY_DANGEROUS", "threshold": "BLOCK_NONE" },
            { "category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE" },
            { "category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE" },
            { "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE" },
            { "category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE" },
        ];
        this.genAI = new GoogleGenerativeAI(getKey('GEMINI_API_KEY'));
        this.supportsRawImageInput = true;
    }

    async sendRequest(turns, systemMessage, imageData = null) {
        let model;
        const modelConfig = {
            model: this.model_name || "gemini-1.5-flash",
            // systemInstruction does not work bc google is trash
        };
        if (this.url) {
            model = this.genAI.getGenerativeModel(modelConfig, { baseUrl: this.url }, { safetySettings: this.safetySettings });
        } else {
            model = this.genAI.getGenerativeModel(modelConfig, { safetySettings: this.safetySettings });
        }
        console.log('Awaiting Google API response...');
        const originalTurnsForLog = [{role: 'system', content: systemMessage}, ...turns];
        turns.unshift({ role: 'system', content: systemMessage });
        turns = strictFormat(turns);
        let contents = [];
        for (let turn of turns) {
            contents.push({
                role: turn.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: turn.content }]
            });
        }

        if (imageData && contents.length > 0) {
            const lastContent = contents[contents.length - 1];
            if (lastContent.role === 'user') { // Ensure the image is added to a user turn
                lastContent.parts.push({
                    inline_data: {
                        mime_type: 'image/jpeg',
                        data: imageData.toString('base64')
                    }
                });
            } else {
                // This case should ideally not happen if imageData is tied to a user message.
                // If it does, we could append a new user turn with the image,
                // or log a warning and send without the image.
                // For now, let's assume the last message is the user's if imageData is present.
                console.warn('[Gemini] imageData provided, but the last content entry was not from a user. Image not sent.');
            }
        }

        const result = await model.generateContent({
            contents,
            generationConfig: { ...(this.params || {}) }
        });
        const response = await result.response;
        let text;
        if (this.model_name && this.model_name.includes("thinking")) {
            if (response.candidates?.length > 0 && response.candidates[0].content?.parts?.length > 1) {
                text = response.candidates[0].content.parts[1].text;
            } else {
                console.warn("Unexpected response structure for thinking model:", response);
                text = response.text();
            }
        } else {
            text = response.text();
        }
        console.log('Received.');
        if (typeof text === 'string') {
            text = text.replace(/<thinking>/g, '<think>').replace(/<\/thinking>/g, '</think>');
        }

        if (imageData) { // If imageData was part of this sendRequest call
            let visionPromptText = ""; // Attempt to find the text prompt associated with the image
            // `contents` is the array sent to the model
            if (contents.length > 0) {
                const lastUserTurnParts = contents[contents.length -1].parts;
                if (Array.isArray(lastUserTurnParts)) {
                    const textPart = lastUserTurnParts.find(part => part.text);
                    if (textPart) visionPromptText = textPart.text;
                }
            }
            logVision(originalTurnsForLog, imageData, text, visionPromptText);
        } else {
            log(JSON.stringify(originalTurnsForLog), text);
        }
        return text;
    }

    async sendVisionRequest(turns, systemMessage, imageBuffer) {
        let model;
        if (this.url) {
            model = this.genAI.getGenerativeModel({ model: this.model_name || "gemini-1.5-flash" }, { baseUrl: this.url }, { safetySettings: this.safetySettings });
        } else {
            model = this.genAI.getGenerativeModel({ model: this.model_name || "gemini-1.5-flash" }, { safetySettings: this.safetySettings });
        }
        const imagePart = { inlineData: { data: imageBuffer.toString('base64'), mimeType: 'image/jpeg' } };
        const stop_seq = '***';
        const prompt = toSinglePrompt(turns, systemMessage, stop_seq, 'model');
        let res = null;
        try {
            console.log('Awaiting Google API vision response...');
            const result = await model.generateContent([prompt, imagePart]);
            const response = await result.response;
            const text = response.text();
            console.log('Received.');
            if (imageBuffer && text) {
                logVision([{role: 'system', content: systemMessage}, ...turns], imageBuffer, text, prompt);
            }
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
            const loggedTurnsForError = [{role: 'system', content: systemMessage}, ...turns];
            if (typeof res === 'string') {
                res = res.replace(/<thinking>/g, '<think>').replace(/<\/thinking>/g, '</think>');
            }
            // For error cases in vision, still use regular log since there's no image to save
            log(JSON.stringify(loggedTurnsForError), res);
        }
        return res;
    }

    async embed(text) {
        let model;
        if (this.url) {
            model = this.genAI.getGenerativeModel({ model: "text-embedding-004" }, { baseUrl: this.url });
        } else {
            model = this.genAI.getGenerativeModel({ model: "text-embedding-004" });
        }
        const result = await model.embedContent(text);
        return result.embedding.values;
    }
}
