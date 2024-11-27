import Groq from 'groq-sdk'
import { getKey } from '../utils/keys.js';


// Umbrella class for Mixtral, LLama, Gemma...
export class GroqCloudAPI {
    constructor(parameters) {
        let chat_name = parameters.model_name.replace('groq/', '').replace('groqcloud/', '');
        this.model_name = chat_name || 'mixtral-8x7b-32768';
        this.temperature = parameters.temperature || 0.2;
        this.top_p = 1;
        this.max_tokens = parameters.max_tokens; // maximum token limit, differs from model to model
        this.url = parameters.url;
        // ReplicateAPI theft :3
        if (this.url) {
            console.warn("Groq Cloud has no implementation for custom URLs. Ignoring provided URL.");
        }
        this.groq = new Groq({ apiKey: getKey('GROQCLOUD_API_KEY') });
    }

    async sendRequest(turns, systemMessage, stop_seq=null) {
        let messages = [{"role": "system", "content": systemMessage}].concat(turns);

        const pack = {
            "messages": messages,
            "model": this.model_name,
            "temperature": this.temperature,
            "max_tokens": this.max_tokens, 
            "top_p": this.top_p,
            "stream": true,
            "stop": stop_seq // "***"
        };

        let res = null;
        try {
            console.log("Awaiting Groq response...");
            let completion = await this.groq.chat.completions.create(pack);
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