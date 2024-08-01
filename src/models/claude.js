import Anthropic from '@anthropic-ai/sdk';
import { strictFormat } from '../utils/text.js';
import { getKey } from '../utils/keys.js';

export class Claude {
    constructor(model_name, url, folder="bot_log") {
        this.model_name = model_name;

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
            // console.log('Messages:', messages);

            const resp = await this.anthropic.messages.create({
                model: this.model_name || "claude-3-sonnet-20240229",
                system: systemMessage,
                max_tokens: 2048,
                messages: messages,
            });
            console.log('Received.')
            res = resp.content[0].text;
            this.logChatCompletion(messages, res);
        }
        catch (err) {
            console.log(err);
            res = 'My brain disconnected, try again.';
        }
        return res;
    }

    async embed(text) {
        throw new Error('Embeddings are not supported by Claude.');
    }
    async logChatCompletion(messages, completion) {
        // async Log the completion in a session folder in a timestamp.json file
        const timestamp = Date.now();
        // get the day for the folder so that everything from the same day is in the same folder
        const day = new Date(timestamp).toISOString().split('T')[0];
        const folder = `bots/${this.folder}/sessions/${day}`;
        // async check to make sure the folder exists
        await fs.access(folder).catch(() => fs.mkdir(folder, { recursive: true }));
        // async write the log file
        const data = { messages, completion };
        await fs.writeFile(`${folder}/${timestamp}.json`, JSON.stringify(data, null, 2));

        return timestamp;
    }
}



