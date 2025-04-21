import { strictFormat } from "../utils/text.js";

export class Pollinations {
    // models: https://text.pollinations.ai/models
    constructor(model_name, url, params) {
        this.model_name = model_name;
        this.params = params;
        this.url = url || "https://text.pollinations.ai/openai";
    }

    async sendRequest(turns, systemMessage) {
        let messages = [{'role': 'system', 'content': systemMessage}].concat(turns);

        const payload = {
            model: this.model_name || "openai-large",
            messages: strictFormat(messages),
            seed: Math.floor( Math.random() * (99999) ),
            referrer: "mindcraft",
            ...(this.params || {})
        };

        let res = null;

        try {
            console.log(`Awaiting pollinations response from model`, this.model_name);
            const response = await fetch(this.url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                console.error(`Failed to receive response. Status`, response.status, (await response.text()));
                res = "My brain disconnected, try again.";
            } else {
                const result = await response.json();
                res = result.choices[0].message.content;
            }
        } catch (err) {
            console.error(`Failed to receive response.`, err || err.message);
            res = "My brain disconnected, try again.";
        }
        return res;
    }

    async sendVisionRequest(messages, systemMessage, imageBuffer) {
        const imageMessages = [...messages];
        imageMessages.push({
            role: "user",
            content: [
                { type: "text", text: systemMessage },
                {
                    type: "image_url",
                    image_url: {
                        url: `data:image/jpeg;base64,${imageBuffer.toString('base64')}`
                    }
                }
            ]
        });

        return this.sendRequest(imageMessages, systemMessage)
    }
}

export async function sendAudioRequest(text, model, voice, url) {
    const payload = {
        model: model,
        modalities: ["text", "audio"],
        audio: {
            voice: voice,
            format: "mp3",
        },
        messages: [
            {
                role: "developer",
                content: "You are an AI that echoes. Your sole function is to repeat back everything the user says to you exactly as it is written. This includes punctuation, grammar, language, and text formatting. Do not add, remove, or alter anything in the user's input in any way. Respond only with an exact duplicate of the user’s query."
                // this is required because pollinations attempts to send an AI response to the text instead of just saying the text.
            },
            {
                role: "user",
                content: text
            }
        ]
    }

    let audioData = null;

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        })

        if (!response.ok) {
            console.error("Failed to get text transcription. Status", response.status, (await response.text()))
            return null;
        }

        const result = await response.json();
        audioData = result.choices[0].message.audio.data;
        return audioData;
    } catch (err) {
        console.error("TTS fetch failed:", err);
        return null;
    }
}