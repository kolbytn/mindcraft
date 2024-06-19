const Groq = require('groq-sdk');
import { getKey } from '../utils/keys.js';

export class Mixtral {
  constructor(model_name, url) {
    this.model_name = model_name;
    this.url = url;
    this.groq = new Groq(getKey('GROQ_API_KEY'));
  }
}

const groq = new Groq();
async function definitelynotmain() {
  const chatCompletion = await groq.chat.completions.create({
    "messages": [
      {
        "role": "system",
        "content": "i like grapes"
      },
      {
        "role": "user",
        "content": ""
      }
    ],
    "model": "mixtral-8x7b-32768",
    "temperature": 0.85,
    "max_tokens": 8192,
    "top_p": 1,
    "stream": true,
    "stop": null
  });

  for await (const chunk of chatCompletion) {
    process.stdout.write(chunk.choices[0]?.delta?.content || '');
  }
}
