
import { getKey, hasKey } from '../utils/keys.js';
import { strictFormat } from '../utils/text.js';

export class Pollinations {
    constructor(model_name, url, params) {
        this.model_name = model_name;
        this.params = params;
        let config = {};

        config.baseURL = url || 'https://text.pollinations.ai/';
    }

    async sendRequest(turns, systemMessage, stop_seq='***') {
        let messages = [{'role': 'system', 'content': systemMessage}].concat(turns);

        messages = strictFormat(messages);

        const pack = {
            model: this.model_name || "openai",
            messages,
            private: true,
        };

        let res = null;
        try {
            console.log('Awaiting Pollinations api response...');
            // console.log('Messages:', messages);
            const response = await fetch('https://text.pollinations.ai/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(pack)

            });
            const data = await response.text();
            console.log('Received.');
            res = data;
        }
        catch (err) {
            console.log(err);
            res = 'My brain disconnected, try again.';
        }
        return res;
    }
}