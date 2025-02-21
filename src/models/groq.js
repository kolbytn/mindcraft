import Groq from 'groq-sdk';
import fs from "fs";
import { getKey } from '../utils/keys.js';

export class GroqCloudAPI {
  constructor(model_name, url, params) {
    this.model_name = model_name;
    this.url = url;
    this.params = params || {};
    if (this.url) {
      console.warn("Groq Cloud has no implementation for custom URLs. Ignoring provided URL.");
    }
    this.groq = new Groq({ apiKey: getKey('GROQCLOUD_API_KEY') });
  }

  async sendRequest(turns, systemMessage, stop_seq = null) {
    let messages = [{ role: "system", content: systemMessage }].concat(turns);
    let res = null;
    try {
      console.log("Awaiting Groq response...");
      if (!this.params.max_tokens) {
        this.params.max_tokens = 16384;
      }
      let completion = await this.groq.chat.completions.create({
        messages,
        model: this.model_name || "mixtral-8x7b-32768",
        stream: true,
        stop: stop_seq,
        ...this.params
      });

      let temp_res = "";
      for await (const chunk of completion) {
        temp_res += chunk.choices[0]?.delta?.content || '';
      }

      res = temp_res;
    } catch (err) {
      console.log(err);
      res = "My brain just kinda stopped working. Try again.";
    }
    return res;
  }

  async embed(text) {
    throw new Error('Embeddings are not supported by Groq.');
  }
}

export class GroqCloudTTS {
  constructor() {
    this.groq = new Groq({ apiKey: getKey('GROQCLOUD_API_KEY') });
  }

  async transcribe(filePath, options = {}) {
    const transcription = await this.groq.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: options.model || "distil-whisper-large-v3-en", // or "whisper-large-v3-turbo", etc.
      prompt: options.prompt || "",
      response_format: options.response_format || "json",
      language: options.language || "en",
      temperature: options.temperature !== undefined ? options.temperature : 0.0,
    });
    return transcription.text;
  }
}