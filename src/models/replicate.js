import Replicate from 'replicate';
import { toSinglePrompt } from './helper.js';

// llama, mistral
export class ReplicateAPI {
	constructor(model_name, url) {
		this.model_name = model_name;
		this.url = url;

		if (this.url) {
			console.warn('Replicate API does not support custom URLs. Ignoring provided URL.');
		}

		if (!process.env.REPLICATE_API_KEY) {
			throw new Error('Replicate API key missing! Make sure you set your REPLICATE_API_KEY environment variable.');
		}

		this.replicate = new Replicate({
			auth: process.env.REPLICATE_API_KEY,
		});
	}

	async sendRequest(turns, systemMessage) {
		const stop_seq = '***';
		let prompt_template;
		const prompt = toSinglePrompt(turns, systemMessage, stop_seq);
		if (this.model_name.includes('llama')) { // llama
			prompt_template = "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n<|eot_id|><|start_header_id|>user<|end_header_id|>\n\n{prompt}<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n"
		}
		else { // mistral
			prompt_template = "<s>[INST] {prompt} [/INST] "
		}

		const input = { prompt, prompt_template };
		let res = null;
		try {
			console.log('Awaiting Replicate API response...');
			let result = '';
			for await (const event of this.replicate.stream(this.model_name, { input })) {
				result += event;
				if (result === '') break;
				if (result.includes(stop_seq)) {
					result = result.slice(0, result.indexOf(stop_seq));
					break;
				}
			}
			res = result;
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
}