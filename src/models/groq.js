import Groq from 'groq-sdk'
import { getKey } from '../utils/keys.js';


// Umbrella class for Mixtral, LLama, Gemma...
export class GroqCloudAPI {
    constructor(model_name, url, max_tokens=16384) {
        this.model_name = model_name;
        this.url = url;
        this.max_tokens = max_tokens;
        // ReplicateAPI theft :3
        if (this.url) {
            console.warn("Groq Cloud has no implementation for custom URLs. Ignoring provided URL.");
        }
        this.groq = new Groq({ apiKey: getKey('GROQCLOUD_API_KEY') });
    }

    async sendRequest(turns, systemMessage, stop_seq=null) {
        let messages = [{"role": "system", "content": systemMessage}].concat(turns);
        let res = null;
        try {
            console.log("Awaiting Groq response...");
            let completion = await this.groq.chat.completions.create({
                "messages": messages,
                "model": this.model_name || "mixtral-8x7b-32768",
                "temperature": 0.2,
                "max_tokens": this.max_tokens, // maximum token limit, differs from model to model
                "top_p": 1,
                "stream": true,
                "stop": stop_seq // "***"
            });

            let temp_res = "";
            for await (const chunk of completion) {
                temp_res += chunk.choices[0]?.delta?.content || '';
            }

            res = temp_res;

        }
        catch(err) {
            console.log(err);
            res = "My brain just kinda stopped working. Try again.";
        }
        return res;
    }

    async embed(text) {
      console.log("There is no support for embeddings in Groq support. However, the following text was provided: " + text);
    }
}