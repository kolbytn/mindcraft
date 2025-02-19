import OpenAIApi from 'openai';
import { getKey } from '../utils/keys.js';

// glhf doesn't supply an SDK for their models, but fully supports OpenAI SDKs
export class glhf {
    constructor(model_name, url) {
        this.model_name = model_name;

        // Retrieve the API key from keys.json
        const apiKey = getKey('GHLF_API_KEY');
        if (!apiKey) {
            throw new Error('API key not found. Please check keys.json and ensure GHLF_API_KEY is defined.');
        }

        // Configure OpenAIApi with the retrieved API key and base URL
        this.openai = new OpenAIApi({
            apiKey,
            baseURL: url || "https://glhf.chat/api/openai/v1"
        });
    }

    async sendRequest(turns, systemMessage, stop_seq = '***') {
        // Construct the message array for the API request
        let messages = [{ 'role': 'system', 'content': systemMessage }].concat(turns);

        const pack = {
            model: this.model_name || "hf:meta-llama/Llama-3.1-405B-Instruct",
            messages,
            stop: [stop_seq]
        };

        let res = null;
        try {
            console.log('Awaiting glhf.chat API response...');
            // Uncomment the line below if you need to debug the messages
            // console.log('Messages:', messages);

            let completion = await this.openai.chat.completions.create(pack);
            if (completion.choices[0].finish_reason === 'length') {
                throw new Error('Context length exceeded');
            }

            console.log('Received.');
            res = completion.choices[0].message.content;
        } catch (err) {
            if ((err.message === 'Context length exceeded' || err.code === 'context_length_exceeded') && turns.length > 1) {
                console.log('Context length exceeded, trying again with shorter context.');
                return await this.sendRequest(turns.slice(1), systemMessage, stop_seq);
            } else {
                console.log(err);
                res = 'My brain disconnected, try again.';
            }
        }

        // Replace special tokens in the response
        return res.replace(/<\|separator\|>/g, '*no response*');
    }

    async embed(text) {
        throw new Error('Embeddings are not supported by glhf.');
    }
}