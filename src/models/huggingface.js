import { toSinglePrompt } from '../utils/text.js';
import { getKey } from '../utils/keys.js';
import { HfInference } from "@huggingface/inference";
import { log, logVision } from '../../logger.js';

export class HuggingFace {
  constructor(model_name, url, params) {
    this.model_name = model_name.replace('huggingface/', '');
    this.url = url;
    this.params = params;
    if (this.url) {
      console.warn("Hugging Face doesn't support custom urls!");
    }
    this.huggingface = new HfInference(getKey('HUGGINGFACE_API_KEY'));
    // Direct image data in sendRequest is not supported by this wrapper.
    // HuggingFace Inference API has other methods for vision tasks.
    this.supportsRawImageInput = false;
  }

  async sendRequest(turns, systemMessage, imageData = null) {
    if (imageData) {
      console.warn(`[HuggingFace] Warning: imageData provided to sendRequest, but this method in huggingface.js does not support direct image data embedding for model ${this.model_name}. The image will be ignored.`);
    }
    const stop_seq = '***';
    const prompt = toSinglePrompt(turns, null, stop_seq);
    const model_name = this.model_name || 'meta-llama/Meta-Llama-3-8B';
    const logInputMessages = [{role: 'system', content: systemMessage}, ...turns];
    const input = systemMessage + "" + prompt;
    const maxAttempts = 5;
    let attempt = 0;
    let finalRes = null;

    while (attempt < maxAttempts) {
      attempt++;
      console.log(`Awaiting Hugging Face API response... (model: ${model_name}, attempt: ${attempt})`);
      let res = '';
      try {
        for await (const chunk of this.huggingface.chatCompletionStream({
          model: model_name,
          messages: [{ role: "user", content: input }],
          ...(this.params || {})
        })) {
          res += (chunk.choices[0]?.delta?.content || "");
        }
      } catch (err) {
        console.log(err);
        res = 'My brain disconnected, try again.';
        break;
      }

      const hasOpenTag = res.includes("<think>");
      const hasCloseTag = res.includes("</think>");

      if ((hasOpenTag && !hasCloseTag)) {
        console.warn("Partial <think> block detected. Re-generating...");
        if (attempt < maxAttempts) continue;
      }
      if (hasOpenTag && hasCloseTag) {
        res = res.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      }
      finalRes = res;
      break;
    }

    if (finalRes == null) {
      console.warn("Could not get a valid response after max attempts.");
      finalRes = 'I thought too hard, sorry, try again.';
    }
    console.log('Received.');
    if (typeof finalRes === 'string') {
        finalRes = finalRes.replace(/<thinking>/g, '<think>').replace(/<\/thinking>/g, '</think>');
    }
    log(JSON.stringify(logInputMessages), finalRes);
    return finalRes;
  }

  async embed(text) {
    throw new Error('Embeddings are not supported by HuggingFace.');
  }
}
