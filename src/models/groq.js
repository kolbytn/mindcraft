import Groq from 'groq-sdk'
import { getKey } from '../utils/keys.js';


// Umbrella class for Mixtral, LLama, Gemma...
export class GroqCloudAPI {
    constructor(model_name, url, params) {
        this.model_name = model_name;
        this.url = url;
        this.params = params || {};
        // ReplicateAPI theft :3
        if (this.url) {

            console.warn("Groq Cloud has no implementation for custom URLs. Ignoring provided URL.");
        }
        this.groq = new Groq({ apiKey: getKey('GROQCLOUD_API_KEY') });
    }

    async sendRequest(turns, systemMessage=null, stop_seq=null) {
        let messages = systemMessage 
            ? [{"role": "system", "content": systemMessage}].concat(turns)
            : turns;
        let res = null;
        try {
            console.log("Awaiting Groq response...");
            let completion = await this.groq.chat.completions.create({
                "messages": messages,
                "model": this.model_name || "mixtral-8x7b-32768",
                "stream": true,
                "stop": stop_seq,
                ...(this.params || {})
            });

            let temp_res = "";
            for await (const chunk of completion) {
                temp_res += chunk.choices[0]?.delta?.content || '';
            }

            res = temp_res;

        }
        catch(err) {
            if (err.message.includes("content must be a string")) {
                res = "Vision is only supported by certain models.";
            } else {
                console.log(this.model_name);
                res = "My brain disconnected, try again.";
            }
            console.log(err);
        }
        return res;
    }

    async sendVisionRequest(messages, systemMessage, imageBuffer) {
        const imageMessages = messages.filter(message => message.role !== 'system');
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
        
        return this.sendRequest(imageMessages);
    }

    async embed(text) {
      console.log("There is no support for embeddings in Groq support. However, the following text was provided: " + text);
    }
}