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

        log(JSON.stringify(messages), result);
        return result;
    }

    async sendVisionRequest(original_turns, systemMessage, imageBuffer) {
        const imageFormattedTurns = [...original_turns];
        // The user message content should be an array for Mistral when including images
        const userMessageContent = [{ type: "text", text: systemMessage }];
        userMessageContent.push({
            type: "image_url", // This structure is based on current code; Mistral SDK might prefer different if it auto-detects from base64 content.
                              // The provided code uses 'imageUrl'. Mistral SDK docs show 'image_url' for some contexts or direct base64.
                              // For `chat.complete`, it's usually within the 'content' array of a user message.
            imageUrl: `data:image/jpeg;base64,${imageBuffer.toString('base64')}`
        });
        imageFormattedTurns.push({
            role: "user",
            content: userMessageContent // Content is an array
        });
        
        // 'systemMessage' passed to sendRequest should be the overarching system prompt.
        // If the 'systemMessage' parameter of sendVisionRequest is the vision text prompt,
        // and it's already incorporated into imageFormattedTurns, then the systemMessage for sendRequest
        // might be a different, more general one, or empty if not applicable.
        // For now, let's assume the 'systemMessage' param of sendVisionRequest is the main prompt for this turn
        // and should also serve as the system-level instruction for the API call via sendRequest.
        const res = await this.sendRequest(imageFormattedTurns, systemMessage); // sendRequest will call log()

        if (imageBuffer && res) {
            logVision(original_turns, imageBuffer, res, systemMessage); // systemMessage here is the vision prompt
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