import {toSinglePrompt} from '../utils/text.js';
import {getKey} from '../utils/keys.js';
import { Client } from "@gradio/client";

export class Gradio {
	constructor(model_name, url) {
		this.model_name = model_name.replace('gradiospace/','');
		this.url = url;

		if (this.url) {
			console.warn("Gradio don't support custom urls!");
		}
	}

	async sendRequest(turns, systemMessage) {
		const stop_seq = '***';
		const prompt = toSinglePrompt(turns, null, stop_seq);
		let model_name = this.model_name || 'KingNish/OpenGPT-4o';

		const input = systemMessage + "\n" + prompt;
		let res = null;
		try {
			console.log('Awaiting Gradio API response...');


			const client = await Client.connect(model_name);
			const result = await client.predict("/chat", {
				user_prompt: {"text": input,"files": []},
			});
			res = result.data;
		} catch (err) {
			console.log(err);
			res = 'My brain disconnected, try again.';
		}
		console.log('Received.');
		console.log(res);
		return res;
	}
}
