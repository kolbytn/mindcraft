import Groq from 'groq-sdk'
import fs from "fs";
import { getKey } from '../utils/keys.js';
import { log, logVision } from '../../logger.js';

// THIS API IS NOT TO BE CONFUSED WITH GROK!
// Go to grok.js for that. :)

// Umbrella class for everything under the sun... That GroqCloud provides, that is.
export class GroqCloudAPI {
    constructor(model_name, url, params) {
        this.model_name = model_name;
        this.url = url;
        this.params = params || {};

        // Remove any mention of "tools" from params:
        if (this.params.tools)
            delete this.params.tools;
        // This is just a bit of future-proofing in case we drag Mindcraft in that direction.

        if (this.url)
            console.warn("Groq Cloud has no implementation for custom URLs. Ignoring provided URL.");

        this.groq = new Groq({ apiKey: getKey('GROQCLOUD_API_KEY') });
        // Direct image data in sendRequest is not supported by this wrapper.
        // Groq may offer specific vision models/APIs, but this standard chat method assumes text.
        this.supportsRawImageInput = false;

    }

    async sendRequest(turns, systemMessage, imageData = null, stop_seq = null) {
        if (imageData) {
            console.warn(`[Groq] Warning: imageData provided to sendRequest, but this method in groq.js does not support direct image data embedding for model ${this.model_name}. The image will be ignored.`);
        }
        // Construct messages array
        let messages = [{"role": "system", "content": systemMessage}].concat(turns);
        let res = null;
        try {
            console.log("Awaiting Groq response...");

            // Handle deprecated max_tokens parameter
            if (this.params.max_tokens) {
                console.warn("GROQCLOUD WARNING: A profile is using `max_tokens`. This is deprecated. Please move to `max_completion_tokens`.");
                this.params.max_completion_tokens = this.params.max_tokens;
                delete this.params.max_tokens;
            }
            if (!this.params.max_completion_tokens) {
                this.params.max_completion_tokens = 4000;
            }

            let completion = await this.groq.chat.completions.create({
                "messages": messages,
                "model": this.model_name || "llama-3.3-70b-versatile",
                "stream": false,
                "stop": stop_seq,
                ...(this.params || {})
            });

            let responseText = completion.choices[0].message.content;
            if (typeof responseText === 'string') {
                responseText = responseText.replace(/<thinking>/g, '<think>').replace(/<\/thinking>/g, '</think>');
            }
            log(JSON.stringify([{ role: "system", content: systemMessage }].concat(turns)), responseText);
            // Original cleaning of <think> tags for the *returned* response (not affecting log)
            responseText = responseText.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
            return responseText;
        } catch(err) {
            if (err.message.includes("content must be a string")) {
                res = "Vision is only supported by certain models.";
            } else {
                console.log(this.model_name);
                res = "My brain disconnected, try again.";
            }
            console.log(err);
            if (typeof res === 'string') {
                res = res.replace(/<thinking>/g, '<think>').replace(/<\/thinking>/g, '</think>');
            }
            log(JSON.stringify([{ role: "system", content: systemMessage }].concat(turns)), res);
            return res;
        }
    }

    async sendVisionRequest(original_turns, systemMessage, imageBuffer) {
        const imageMessages = [...original_turns];
        imageMessages.push({
            role: "user",
            content: [
                { type: "text", text: systemMessage },
                {
                    type: "image_url",
                    image_url: { url: `data:image/jpeg;base64,${imageBuffer.toString('base64')}` }
                }
            ]
        });

        const res = await this.sendRequest(imageMessages, systemMessage);

        if (imageBuffer && res) {
            logVision([{ role: "system", content: systemMessage }].concat(original_turns), imageBuffer, res, systemMessage);
        }
        return res;
    }

    async embed(_) {
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
      model: options.model || "distil-whisper-large-v3-en", // or "whisper-large-v3-turbo"
      prompt: options.prompt || "",
      response_format: options.response_format || "json",
      language: options.language || "en",
      temperature: options.temperature !== undefined ? options.temperature : 0.0,
    });
    return transcription.text;
  }
}
