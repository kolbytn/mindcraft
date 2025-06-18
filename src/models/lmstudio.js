
import { LMStudioClient, Chat } from '@lmstudio/sdk';

export class LMStudio {
    constructor(model_name, url, params) {
        this.model_name = model_name;
        this.params = params;

        let config = {};
        if (url)
            config.baseURL = url;
        else
            config.baseURL = "ws://127.0.0.1:1234";

        this.lmstudio = new LMStudioClient({
            baseUrl: config.baseURL
        });
    }


    async sendRequest(turns, systemMessage, stop_seq='***') {
        let res = null;

        let pack = {
            reasoningParsing: {
                enabled: true,
                startString: "<think>",
                endString: "</think>"
            },
            ...this.params || {}
        };
        try {
            let messages = [{'role': 'system', 'content': systemMessage}].concat(turns);
            let chat = Chat.from(messages);
            const model = await this.lmstudio.llm.model(this.model_name || "qwen3-8b");
            let response = await model.respond(chat, pack);
            const { content, stats, nonReasoningContent } = response;

            if (stats.stopReason === "contextLengthReached") throw new Error("Context length exceeded");
            if (stats.stopReason === "failed") throw new Error("Failed to generate response");
            
            res = nonReasoningContent || content;
        } catch (err) {
            console.error('Error while awaiting response:', err);
            // If the error indicates a context-length problem, we can slice the turns array, etc.
            res = "My brain disconnected, try again.";
        }
        return res;
    }

    async sendVisionRequest(messages, systemMessage, imageBuffer) {
        const imageMessages = [...messages];
        const image = await this.lmstudio.files.prepareImageBase64(imageBuffer);
        imageMessages.push({
            role: "user",
            content: systemMessage,
            image: [image],
        });
        return this.sendRequest(imageMessages, systemMessage);
    }

    async embed(text) {
        if (text.length > 8191)
            text = text.slice(0, 8191);

        const model = await this.lmstudio.llm.model(this.model_name || "text-embedding-nomic-embed-text-v1.5");
        const { embedding } = await model.embed(text);
        return embedding;
    }

}



