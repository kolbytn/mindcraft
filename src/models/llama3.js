import Replicate from 'replicate';
import { GPT } from './gpt.js';

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN, });

export class Llama3 {
  constructor() {
    this.replicate = new Replicate();
    this.gpt = undefined;
    try {
      this.gpt = new GPT(); // use for embeddings
    } catch (err) {
      console.warn('Llama3 uses the OpenAI API for embeddings, but no OPENAI_API_KEY env variable was found. Llama3 will still work, but performance will suffer.');
    }
  }

  async sendRequest(turns, systemMessage, stop_seq = '***') {
    let prev_role = null;
    let messages = [];
    let filler = { role: 'user', content: '_' };

    for (let msg of turns) {
      if (msg.role === 'system') {
        msg.role = 'user';
        msg.content = 'SYSTEM: ' + msg.content;
      }
      if (msg.role === prev_role && msg.role === 'assistant') {
        // insert empty user message to separate assistant messages
        messages.push(filler);
        messages.push(msg);
      } else if (msg.role === prev_role) {
        // combine new message with previous message instead of adding a new one
        messages[messages.length - 1].content += '\n' + msg.content;
      } else {
        messages.push(msg);
      }
      prev_role = msg.role;
    }

    if (messages.length === 0) {
      messages.push(filler);
    }

    const prompt = systemMessage + '\n\n' + messages.map(msg => `${msg.role}: ${msg.content}`).join('\n');
    const input = {
      prompt: prompt,
      prompt_template: "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\nYou are a helpful assistant<|eot_id|><|start_header_id|>user<|end_header_id|>\n\n{prompt}<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n",
      presence_penalty: 0,
      frequency_penalty: 0
    };

    let res = null;
    try {
      console.log('Awaiting Replicate API response...');
      console.log('Input:', input);
      let result = '';
      for await (const event of this.replicate.stream("meta/meta-llama-3-70b-instruct", { input })) {
        result += event;
      }
      console.log('Received.');
      res = result;
    } catch (err) {
      console.log(err);
      res = 'My brain disconnected, try again.';
    }

    return res;
  }

  async embed(text) {
    if (this.gpt) {
      return await this.gpt.embed(text);
    }
    // if no gpt, just return random embedding
    return Array(1).fill().map(() => Math.random());
  }
}