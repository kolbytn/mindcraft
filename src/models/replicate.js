import Replicate from 'replicate';
import { toSinglePrompt } from '../utils/text.js';
import { getKey } from '../utils/keys.js';

// llama, mistral, gemini
export class ReplicateAPI {
	static prefix = 'replicate';
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
	}

	async sendRequest(turns, systemMessage) {
		const stop_seq = '***';
		const prompt = toSinglePrompt(turns, null, stop_seq);
		let model_name = this.model_name || 'meta/meta-llama-3-70b-instruct';

		// Detect model type to use correct input format
		const isGemini = model_name.includes('gemini');

		let input;
		if (isGemini) {
			// Gemini models on Replicate ignore system_prompt field
			// Combine system message into the main prompt instead
			const fullPrompt = systemMessage + '\n\n' + prompt;
			input = { 
				prompt: fullPrompt,
				...(this.params || {})
			};
		} else {
			// Llama and other models use system_prompt
			input = { 
				prompt, 
				system_prompt: systemMessage,
				...(this.params || {})
			};
		}

		let res = null;
		try {
			console.log('Awaiting Replicate API response...');

			if (isGemini) {
				// Gemini doesn't stream well on Replicate, use run() instead
				const output = await this.replicate.run(model_name, { input });
				// Output might be a string or an array
				if (Array.isArray(output)) {
					res = output.join('');
				} else if (typeof output === 'string') {
					res = output;
				} else {
					res = String(output);
				}
			} else {
				// Use streaming for other models
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
			}

			// Trim stop sequence if present
			if (res && res.includes(stop_seq)) {
				res = res.slice(0, res.indexOf(stop_seq));
			}
		} catch (err) {
			console.log(err);
			res = 'My brain disconnected, try again.';
		}
		console.log('Received.');
		return res;
	}

	async embed(text) {
		// Always use a dedicated embedding model, not the chat model
		const DEFAULT_EMBEDDING_MODEL = "mark3labs/embeddings-gte-base:d619cff29338b9a37c3d06605042e1ff0594a8c3eff0175fd6967f5643fc4d47";

		// Validate text input
		if (!text || typeof text !== 'string') {
			throw new Error('Text is required for embedding');
		}

		// Check if model_name is an embedding model or a chat model
		// Chat models (like meta/meta-llama-3-70b-instruct) won't work for embeddings
		const isEmbeddingModel = this.model_name && (
			this.model_name.includes('embed') || 
			this.model_name.includes('gte') ||
			this.model_name.includes('e5-')
		);
		const embeddingModel = isEmbeddingModel ? this.model_name : DEFAULT_EMBEDDING_MODEL;

		// Helper to extract embedding from various output formats
		const extractEmbedding = (output) => {
			if (output.vectors) {
				return output.vectors;
			} else if (Array.isArray(output)) {
				return output;
			} else if (output.embedding) {
				return output.embedding;
			} else if (output.embeddings) {
				return Array.isArray(output.embeddings[0]) ? output.embeddings[0] : output.embeddings;
			}
			return null;
		};

		try {
			const output = await this.replicate.run(
				embeddingModel,
				{ input: { text } }
			);
			const embedding = extractEmbedding(output);
			if (embedding) {
				return embedding;
			}
			throw new Error('Unknown embedding output format');
		} catch (err) {
			console.error('Replicate embed error:', err.message || err);
			throw err;
		}
	}
}