import { Mistral as MistralClient } from '@mistralai/mistralai';
import { getKey } from '../utils/keys.js';
import { strictFormat } from '../utils/text.js';

export class Mistral {
    #client;

    constructor(model_name, url, params) {
        this.model_name = model_name;
        this.params = params;

        if (typeof url === "string") {
            console.warn("Mistral does not support custom URL's, ignoring!");

        }

        if (!getKey("MISTRAL_API_KEY")) {
            throw new Error("Mistral API Key missing, make sure to set MISTRAL_API_KEY in settings.json")
        }

        this.#client = new MistralClient(
            {
                apiKey: getKey("MISTRAL_API_KEY")
            }
        );

        
        // Prevents the following code from running when model not specified
        if (typeof this.model_name === "undefined") return;

        // get the model name without the "mistral" or "mistralai" prefix
        // e.g "mistral/mistral-large-latest" -> "mistral-large-latest"
        if (typeof model_name.split("/")[1] !== "undefined") {
            this.model_name = model_name.split("/")[1];
        }
    }

    async sendRequest(turns, systemMessage) {

        let result;

        try {
            const model = this.model_name || "mistral-large-latest";

            const messages = [
                { role: "system", content: systemMessage }
            ];
            messages.push(...strictFormat(turns));

            const response  = await this.#client.chat.complete({
                model,
                messages,
                ...(this.params || {})
            });

            result = response.choices[0].message.content;
        } catch (err) {
            console.log(err)

            result = "My brain disconnected, try again.";
        }

        return result;
    }

    async embed(text) {
        const embedding = await this.#client.embeddings.create({
            model: "mistral-embed",
            inputs: text
        });
        return embedding.data[0].embedding;
    }
}