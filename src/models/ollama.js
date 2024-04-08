import OpenAIApi from 'openai';
import axios from 'axios';
import { readFileSync } from 'fs';

let ollamaSettings = JSON.parse(readFileSync('./ollama-config.json', 'utf8'));

function getContentInBrackets(str) {
    const startIndex = str.indexOf("[");
    const endIndex = str.indexOf("]");

    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      return str.substring(startIndex + 1, endIndex);
    } else {
      return "";
    }
}

export class Ollama {
    constructor(model_name) {
        this.model_name = getContentInBrackets(model_name);
        let ollamaConfig = null;

        if (this.model_name == "") {
            throw new Error('Model is not specified! Please ensure you input the model in the following format: ollama[model]. For example, for Mistral, use: ollama[mistral]');
        }

        axios.get(ollamaSettings["url"]).then(response => {

            if (response.status === 200) {
                ollamaConfig = {
                    baseURL: `${ollamaSettings["url"]}/v1`,   
                    apiKey: 'ollama', // required but unused
                };

                this.openai = new OpenAIApi(ollamaConfig);
            } 
            else {
                throw new Error(`Error relating the endpoint: ${response.status}.`);
            }

        });
    
        
    }

    async sendRequest(turns, systemMessage, stop_seq='***') {

        console.log(this.model_name)
        let messages = [{'role': 'system', 'content': systemMessage}].concat(turns);

        let res = null;
        try {
            console.log(`Awaiting ollama response... (model: ${this.model_name})`)
            console.log('Messages:', messages);
            let completion = await this.openai.chat.completions.create({
                
                model: this.model_name,
                messages: messages,
                stop: stop_seq,
            });
            if (completion.choices[0].finish_reason == 'length')
                throw new Error('Context length exceeded'); 
            console.log('Received.')
            res = completion.choices[0].message.content;
        }
        catch (err) {
            if ((err.message == 'Context length exceeded' || err.code == 'context_length_exceeded') && turns.length > 1) {
                console.log('Context length exceeded, trying again with shorter context.');
                return await sendRequest(turns.slice(1), systemMessage, stop_seq);
            } else {
                console.log(err);
                res = 'My brain disconnected, try again.';
            }
        }
        return res;
    }

    async embed(text) {

        // Will implement this when Ollama will support embeddings in OpenAI format
        /*
        const embedding = await this.openai.embeddings.create({
            model: "nomic-embed-text",
            input: text,
            encoding_format: "float",
        });
        return embedding.data[0].embedding;
        */

        // For now, I'll do http request using axios:

        try {
            const response = await axios.post(`${ollamaSettings["url"]}/api/embeddings`, {
              model: ollamaSettings["embedding_model"],
              prompt: text
            });
            return response.data.embedding;
          } catch (error) {
            console.error('Error embedding text:', error.response ? error.response.data : error.message);
            return Array(1).fill().map(() => Math.random());
          }
    }

}



