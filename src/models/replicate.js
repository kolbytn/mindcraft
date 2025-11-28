import Replicate from 'replicate';
import { toSinglePrompt } from '../utils/text.js';
import { getKey } from '../utils/keys.js';

// llama, mistral
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
		const isLlama = model_name.includes('llama') || model_name.includes('meta/');
		
		let input;
		if (isGemini) {
			// Gemini models use system_instruction and expect the full prompt with system message
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
			console.log('  Model:', model_name, isGemini ? '(Gemini format)' : '(Llama format)');
			let result = '';
			let eventCount = 0;
			for await (const event of this.replicate.stream(model_name, { input })) {
				eventCount++;
				result += event;
				if (result === '') break;
				if (result.includes(stop_seq)) {
					result = result.slice(0, result.indexOf(stop_seq));
					break;
				}
			}
			res = result;
			console.log('Received. Events:', eventCount, 'Response length:', res.length);
			console.log('Response:', res.substring(0, 500));
			if (!res || res.trim() === '') {
				console.log('WARNING: Empty response from model');
			}
		} catch (err) {
			console.log('Replicate error:', err);
			res = 'My brain disconnected, try again.';
		}
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
				// Some models return the embedding array directly
				return output;
			} else if (output.embedding) {
				return output.embedding;
			} else if (output.embeddings) {
				return Array.isArray(output.embeddings[0]) ? output.embeddings[0] : output.embeddings;
			}
			return null;
		};
		
		// Try different input formats since models have varying expectations
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