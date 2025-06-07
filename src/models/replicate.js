import Replicate from 'replicate';
import { toSinglePrompt } from '../utils/text.js';
import { getKey } from '../utils/keys.js';
import { log, logVision } from '../../logger.js';

// llama, mistral
export class ReplicateAPI {
	constructor(model_name, url, params) {
		this.model_name = model_name;
		this.url = url;
		this.params = params;

		if (this.url) {
			console.warn('Replicate API does not support custom URLs. Ignoring provided URL.');
		}

		this.replicate = new Replicate({
			auth: getKey('REPLICATE_API_KEY'),
		});
		// Direct image data in sendRequest is not supported by this wrapper.
		// Replicate handles vision models differently, often with specific inputs like "image".
		this.supportsRawImageInput = false;
	}

	async sendRequest(turns, systemMessage, imageData = null) {
		if (imageData) {
			console.warn(`[ReplicateAPI] Warning: imageData provided to sendRequest, but this method in replicate.js does not support direct image data embedding for model ${this.model_name}. The image will be ignored. Replicate models with vision capabilities usually require specific input fields like 'image' with a URL or base64 string.`);
		}
		const stop_seq = '***';
		const prompt = toSinglePrompt(turns, null, stop_seq);
		let model_name = this.model_name || 'meta/meta-llama-3-70b-instruct';

		const logInputMessages = [{role: 'system', content: systemMessage}, ...turns];
		const input = { 
			prompt, 
			system_prompt: systemMessage,
			...(this.params || {})
		};
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
		} catch (err) {
			console.log(err);
			res = 'My brain disconnected, try again.';
		}
		if (typeof res === 'string') {
            res = res.replace(/<thinking>/g, '<think>').replace(/<\/thinking>/g, '</think>');
        }
		log(JSON.stringify(logInputMessages), res);
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