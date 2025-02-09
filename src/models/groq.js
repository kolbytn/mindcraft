import Groq from 'groq-sdk'
import { getKey } from '../utils/keys.js';

// Umbrella class for Mixtral, LLama, Gemma...
export class GroqCloudAPI {

  constructor(model_name, url, params) {
    this.model_name = model_name;
    this.url = url;
    this.params = params || {};
    // Groq Cloud does not support custom URLs; warn if provided
    if (this.url) {
      console.warn("Groq Cloud has no implementation for custom URLs. Ignoring provided URL.");

    }
    this.groq = new Groq({ apiKey: getKey('GROQCLOUD_API_KEY') });
  }

  async sendRequest(turns, systemMessage, stop_seq = null) {
    const maxAttempts = 5;
    let attempt = 0;
    let finalRes = null;
    const messages = [{ role: "system", content: systemMessage }].concat(turns);

    while (attempt < maxAttempts) {
      attempt++;
      let res = null;
      try {
        console.log(`Awaiting Groq response... (model: ${this.model_name || "mixtral-8x7b-32768"}, attempt: ${attempt})`);
        if (!this.params.max_tokens) {
          this.params.max_tokens = 16384;
        }
        // Create the streaming chat completion request
        const completion = await this.groq.chat.completions.create({
          messages: messages,
          model: this.model_name || "mixtral-8x7b-32768",
          stream: true,
          stop: stop_seq,
          ...(this.params || {})
        });


        let temp_res = "";
        // Aggregate streamed chunks into a full response
        for await (const chunk of completion) {
          temp_res += chunk.choices[0]?.delta?.content || '';
        }
        res = temp_res;
      } catch (err) {
        console.log(err);
        res = "My brain just kinda stopped working. Try again.";
      }

      // If the model name includes "deepseek-r1", handle the <think> tags
      if (this.model_name && this.model_name.toLowerCase().includes("deepseek-r1")) {
        const hasOpenTag = res.includes("<think>");
        const hasCloseTag = res.includes("</think>");

        // If a partial <think> block is detected, log a warning and retry
        if (hasOpenTag && !hasCloseTag) {
          console.warn("Partial <think> block detected. Re-generating Groq request...");
          continue;
        }

        // If only the closing tag is present, prepend an opening tag
        if (hasCloseTag && !hasOpenTag) {
          res = '<think>' + res;
        }
        // Remove the complete <think> block (and any content inside) from the response
        res = res.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      }

      finalRes = res;
      break; // Exit the loop once a valid response is obtained
    }

    if (finalRes == null) {
      console.warn("Could not obtain a valid <think> block or normal response after max attempts.");
      finalRes = "Response incomplete, please try again.";
    }
    finalRes = finalRes.replace(/<\|separator\|>/g, '*no response*');

    return finalRes;
  }

  async embed(text) {
    console.log("There is no support for embeddings in Groq support. However, the following text was provided: " + text);
  }
}