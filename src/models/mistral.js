import { Mistral as MistralClient } from '@mistralai/mistralai';
import { getKey } from '../utils/keys.js';
import { strictFormat } from '../utils/text.js';
import { log, logVision } from '../../logger.js';

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
        this.supportsRawImageInput = false; // Standard chat completions may not support raw images for all models.

        
        if (typeof this.model_name === "string" && typeof this.model_name.split("/")[1] !== "undefined") {
            this.model_name = this.model_name.split("/")[1];
        }
    }

    async sendRequest(turns, systemMessage, imageData = null) {
        if (imageData) {
            console.warn(`[Mistral] Warning: imageData provided to sendRequest, but this method in mistral.js currently does not support direct image data embedding for model ${this.model_name}. The image will be ignored. Use sendVisionRequest for models/endpoints that support vision, or ensure the API/model used by sendRequest can handle images in its standard chat format.`);
            // imageData is ignored for now.
        }

        let result;
        const model = this.model_name || "mistral-large-latest";
        const messages = [{ role: "system", content: systemMessage }];
        messages.push(...strictFormat(turns));
        try {
            console.log('Awaiting mistral api response...')
            const response  = await this.#client.chat.complete({
                model,
                messages,
                ...(this.params || {})
            });
            result = response.choices[0].message.content;
        } catch (err) {
            if (err.message.includes("A request containing images has been given to a model which does not have the 'vision' capability.")) {
                result = "Vision is only supported by certain models.";
            } else {
                result = "My brain disconnected, try again.";
            }
            console.log(err);
        }
        if (typeof result === 'string') {
            result = result.replace(/<thinking>/g, '<think>').replace(/<\/thinking>/g, '</think>');
        }
        log(JSON.stringify(messages), result);
        return result;
    }

    async sendVisionRequest(original_turns, systemMessage, imageBuffer) {
        const imageFormattedTurns = [...original_turns];
        const userMessageContent = [{ type: "text", text: systemMessage }];
        userMessageContent.push({
            type: "image_url",
            imageUrl: `data:image/jpeg;base64,${imageBuffer.toString('base64')}`
        });
        imageFormattedTurns.push({ role: "user", content: userMessageContent });
        
        const res = await this.sendRequest(imageFormattedTurns, systemMessage);

        if (imageBuffer && res) {
            logVision(original_turns, imageBuffer, res, systemMessage);
        }
        return res;
    }

    async embed(text) {
        const embedding = await this.#client.embeddings.create({
            model: "mistral-embed",
            inputs: text
        });
        return embedding.data[0].embedding;
    }
}