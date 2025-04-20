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
                console.error(`Failed to receive response. Status`, response.status, response.text);
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
}

