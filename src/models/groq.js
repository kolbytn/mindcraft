import Groq from 'groq-sdk'
import { getKey } from '../utils/keys.js';

export class Mixtral {
    constructor(model_name, url) {
        this.model_name = model_name;
        this.url = url;
        this.groq = new Groq({ apiKey: getKey('GROQ_API_KEY')});
    }

    async sendRequest(turns, systemMessage, stop_seq="***") {
        let messages = [{"role": "system", "content": systemMessage}].concat(turns);
        let res = null;
        try {
            console.log("Awaiting Groq response...");
            let completion = await this.groq.chat.completions.create({
                "messages": messages,
                "model": this.model_name || "mixtral-8x7b-32768",
                "temperature": 0.45,
                "max_tokens": 8192,
                "top_p": 1,
                "stream": true,
                "stop": stop_seq
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
      /* GPT's embed:
              const embedding = await this.openai.embeddings.create({
            model: this.model_name || "text-embedding-ada-002",
            input: text,
            encoding_format: "float",
        });
        return embedding.data[0].embedding;
      */

      // lol no embeddings for u
      // l
      console.log("big oof, embeds on groq dont is not thing");
      
    }
}

async function definitelynotmain() {
  const chatCompletion = await groq.chat.completions.create({
    "messages": "",
    "model": "mixtral-8x7b-32768",
    "temperature": 0.85,
    "max_tokens": 8192,
    "top_p": 1,
    "stream": true,
    "stop": "***"
  });

  for await (const chunk of chatCompletion) {
    process.stdout.write(chunk.choices[0]?.delta?.content || '');
  }
}
