import OpenAIApi from 'openai';
import axios from 'axios';
import { readFileSync } from 'fs';

let localSettings = JSON.parse(readFileSync('./local-config.json', 'utf8'));

function getContentInBrackets(str) {
    const startIndex = str.indexOf("[");
    const endIndex = str.indexOf("]");

    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      return str.substring(startIndex + 1, endIndex);
    } else {
      return "";
    }
}

export class Local {
    constructor(model_name) {
        this.model_name = getContentInBrackets(model_name);
        let localConfig = null;
        localSettings["url"] = localSettings["url"].replace("/v1", "");

        if (this.model_name == "") {
            throw new Error('Model is not specified! Please ensure you input the model in the following format: ollama[model]. For example, for Mistral instruct, use: ollama[mistral:instruct]');
        }

        axios.get(localSettings["url"]).then(response => {

            if (response.status === 200) {
                localConfig = {
                    baseURL: `${localSettings["url"]}/v1`,
                    apiKey: localSettings["api_key"],
                };

                this.openai = new OpenAIApi(localConfig);
            } 
            else {
                throw new Error(`Error relating the endpoint: ${response.status}.`);
            }

        });
    
        
    }

    async sendRequest(turns, systemMessage, stop_seq='***') {

        let messages = [{'role': 'system', 'content': systemMessage}].concat(turns);

        let res = null;
        try {
            console.log(`Awaiting local response... (model: ${this.model_name})`)
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

        try {
            if (localSettings["api_key"] == "ollama") { //Embedding if it is Ollama (temporary)
                const response = await axios.post(`${localSettings["url"]}/api/embeddings`, {
                    model: localSettings["embedding_model"],
                    prompt: text
                });
                return response.data.embedding;
            }
            
            const embedding = await this.openai.embeddings.create({
                model: localSettings["embedding_model"],
                input: text,
                encoding_format: "float",
            });
            return embedding.data[0].embedding;

        } catch (error) {
            console.log('Error embedding text:', error.response ? error.response.data : error.message);
            return Array(1).fill().map(() => Math.random());
        }

    }

}



