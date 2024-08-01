import Replicate from 'replicate';
import { toSinglePrompt } from '../utils/text.js';
import { getKey } from '../utils/keys.js';

// llama, mistral
export class ReplicateAPI {
	constructor(model_name, url, folder = 'bot_log') {
		this.model_name = model_name;
		this.url = url;

		if (this.url) {
			console.warn('Replicate API does not support custom URLs. Ignoring provided URL.');
		}

		this.replicate = new Replicate({
			auth: getKey('REPLICATE_API_KEY'),
		});
	}

	async sendRequest(turns, systemMessage) {
		const stop_seq = '***';
		const prompt = toSinglePrompt(turns, null, stop_seq);
		let model_name = this.model_name || 'meta/meta-llama-3-70b-instruct';

		const input = { prompt, system_prompt: systemMessage };
		let res = null;
		try {
			console.log('Awaiting Replicate API response...');
			let result = '';
			for await (const event of this.replicate.stream(model_name, { input })) {
				result += event;
				if (result === '') break;
				if (result.includes(stop_seq)) {
					result = result.slice(0, result.indexOf(stop_seq));
					break;
				}
			}
			res = result;
			this.logChatCompletion(turns, res);
		} catch (err) {
			console.log(err);
			res = 'My brain disconnected, try again.';
		}
		console.log('Received.');
		return res;
	}

	async embed(text) {
		const output = await this.replicate.run(
			this.model_name || "mark3labs/embeddings-gte-base:d619cff29338b9a37c3d06605042e1ff0594a8c3eff0175fd6967f5643fc4d47",
			{ input: {text} }
		);
		return output.vectors;
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