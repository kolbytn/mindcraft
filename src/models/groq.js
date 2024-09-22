import Groq from "groq-sdk";
import {toSinglePrompt} from '../utils/text.js';
import {getKey} from '../utils/keys.js';
import {GoogleGenerativeAI} from "@google/generative-ai";

// llama, mistral
export class GroqAPI {
	constructor(model_name, url) {
		this.model_name = model_name;
		this.url = url;

		if (this.url) {
			console.warn('Does Groq API support custom URLs?');
		}

		this.groq = new Groq({
			apiKey: getKey('GROQ_API_KEY'),
		});
	}

	async getGroqChatCompletion(prompt, model) {
		return this.groq.chat.completions.create({
			messages: [
				{
					role: "system",
					content: prompt,
				},
			],
			model: model,
		});
	}

	async sendRequest(turns, systemMessage) {
		const stop_seq = '***';
		const prompt = toSinglePrompt(turns, null, stop_seq);
		let model_name = this.model_name || 'llama3-8b-8192';

		const input = systemMessage + "\n" + prompt;
		let res = null;
		try {
			console.log('Awaiting Groq API response...');
			let result = await this.getGroqChatCompletion(input, model_name);
			res = result.choices[0]?.message?.content;
		} catch (err) {
			console.log(err);
			res = 'My brain disconnected, try again.';
		}
		console.log('Received.');
		console.log(res);
		return res;
	}
}
