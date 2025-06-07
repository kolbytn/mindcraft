import OpenAIApi from 'openai';
import { getKey } from '../utils/keys.js';
import { strictFormat } from '../utils/text.js';
import { log, logVision } from '../../logger.js';

// llama, mistral
export class Novita {
	constructor(model_name, url, params) {
    this.model_name = model_name.replace('novita/', '');
    this.url = url || 'https://api.novita.ai/v3/openai';
    this.params = params;


    let config = {
      baseURL: this.url
    };
    config.apiKey = getKey('NOVITA_API_KEY');

    this.openai = new OpenAIApi(config);
  }

	async sendRequest(turns, systemMessage, stop_seq='***') {
      let messages = [{'role': 'system', 'content': systemMessage}].concat(turns);

      
      messages = strictFormat(messages);
      
      const pack = {
          model: this.model_name || "meta-llama/llama-3.1-70b-instruct",
          messages,
          stop: [stop_seq],
          ...(this.params || {})
      };

      let res = null;
      try {
          console.log('Awaiting novita api response...')
          let completion = await this.openai.chat.completions.create(pack);
          if (completion.choices[0].finish_reason == 'length')
              throw new Error('Context length exceeded'); 
          console.log('Received.')
          res = completion.choices[0].message.content;
      }
      catch (err) {
          if ((err.message == 'Context length exceeded' || err.code == 'context_length_exceeded') && turns.length > 1) {
              console.log('Context length exceeded, trying again with shorter context.');
              return await sendRequest(turns.slice(1), systemMessage, stop_seq);
          } else {
            console.log(err);
              res = 'My brain disconnected, try again.';
          }
      }
      log(JSON.stringify(messages), res); // Log before stripping <think> tags

      // Existing stripping logic for <think> tags
      if (res && typeof res === 'string' && res.includes('<think>')) {
          let start = res.indexOf('<think>');
          let end = res.indexOf('</think>') + 8; // length of '</think>'
          if (start !== -1) { // Ensure '<think>' was found
              if (end !== -1 && end > start + 7) { // Ensure '</think>' was found and is after '<think>'
                  res = res.substring(0, start) + res.substring(end);
              } else {
                  // Malformed or missing end tag, strip from '<think>' onwards or handle as error
                  // Original code: res = res.substring(0, start+7); This would leave "<think>"
                  // Let's assume we strip from start if end is not valid.
                  res = res.substring(0, start);
              }
          }
          res = res.trim();
      }
      return res;
  }

	async embed(text) {
		throw new Error('Embeddings are not supported by Novita AI.');
	}
}
