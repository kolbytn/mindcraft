import Anthropic from '@anthropic-ai/sdk';
import { strictFormat } from '../utils/text.js';
import { getKey } from '../utils/keys.js';
import { log, logVision } from '../../logger.js';

export class Claude {
    constructor(model_name, url, params) {
        this.model_name = model_name;
        this.params = params || {};

        let config = {};
        if (url)
            config.baseURL = url;
        
        config.apiKey = getKey('ANTHROPIC_API_KEY');

        this.anthropic = new Anthropic(config);
    }

    async sendRequest(turns, systemMessage) {
        const messages = strictFormat(turns);
        let res = null;
        try {
            console.log('Awaiting anthropic api response...')
            if (!this.params.max_tokens) {
                if (this.params.thinking?.budget_tokens) {
                    this.params.max_tokens = this.params.thinking.budget_tokens + 1000;
                    // max_tokens must be greater than thinking.budget_tokens
                } else {
                    this.params.max_tokens = 4096;
                }
            }
            const resp = await this.anthropic.messages.create({
                model: this.model_name || "claude-3-sonnet-20240229",
                system: systemMessage,
                messages: messages,
                ...(this.params || {})
            });

            console.log('Received.')
            // get first content of type text
            const textContent = resp.content.find(content => content.type === 'text');
            if (textContent) {
                res = textContent.text;
            } else {
                console.warn('No text content found in the response.');
                res = 'No response from Claude.';
            }
        }
        catch (err) {
            if (err.message.includes("does not support image input")) {
                res = "Vision is only supported by certain models.";
            } else {
                res = "My brain disconnected, try again.";
            }
            console.log(err);
        }
        const logMessagesForClaude = [{ role: "system", content: systemMessage }].concat(turns);
        // The actual 'turns' passed to anthropic.messages.create are already strictFormatted
        // For logging, we want to capture the input as it was conceptually given.
        log(JSON.stringify(logMessagesForClaude), res);
        return res;
    }

    async sendVisionRequest(turns, systemMessage, imageBuffer) {
        const visionUserMessageContent = [
            { type: "text", text: systemMessage }, // Text part of the vision message
            {
                type: "image",
                source: {
                    type: "base64",
                    media_type: "image/jpeg",
                    data: imageBuffer.toString('base64')
                }
            }
        ];
        // Create the turns structure that will actually be sent to the API
        const turnsForAPIRequest = [...turns, { role: "user", content: visionUserMessageContent }];

        // Call sendRequest. Note: Claude's sendRequest takes systemMessage separately.
        // The systemMessage parameter for sendRequest here should be the overall system instruction,
        // not the text part of the vision message if that's already included in turnsForAPIRequest.
        // Assuming the passed 'systemMessage' to sendVisionRequest is the vision prompt.
        // And the actual system prompt for the Claude API call is handled by sendRequest's own 'systemMessage' param.
        // Let's assume the 'systemMessage' passed to sendVisionRequest is the primary text prompt for the vision task.
        // The 'sendRequest' function will handle its own logging using log().

        const res = await this.sendRequest(turnsForAPIRequest, systemMessage); // This will call log() internally for the text part.

        // After getting the response, specifically log the vision interaction.
        if (imageBuffer && res) {
            // 'turns' are the original conversation turns *before* adding the vision-specific user message.
            // 'systemMessage' here is used as the 'visionMessage' (the text prompt accompanying the image).
            logVision(turns, imageBuffer, res, systemMessage);
        }
        return res;
    }

    async embed(text) {
        throw new Error('Embeddings are not supported by Claude.');
    }
}
