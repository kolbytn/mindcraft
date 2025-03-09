import Groq from 'groq-sdk'
import { getKey } from '../utils/keys.js';

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

        // I'm going to do a sneaky ReplicateAPI theft for a lot of this, aren't I?
        if (this.url)
            console.warn("Groq Cloud has no implementation for custom URLs. Ignoring provided URL.");

        this.groq = new Groq({ apiKey: getKey('GROQCLOUD_API_KEY') });


    }

 async sendRequest(turns, systemMessage, stop_seq = null) {
  // Variables for DeepSeek-R1 models
  const maxAttempts = 5;
  let attempt = 0;
  let finalRes = null;
  let res = null;

  // Construct messages array
  let messages = [{"role": "system", "content": systemMessage}].concat(turns);

  while (attempt < maxAttempts) {
    attempt++;

    // These variables look odd, but they're for the future.
    let raw_res = null;
    let tool_calls = null;

    try {
      console.log("Awaiting Groq response...");

      // Handle deprecated max_tokens parameter
      if (this.params.max_tokens) {
        console.warn("GROQCLOUD WARNING: A profile is using `max_tokens`. This is deprecated. Please move to `max_completion_tokens`.");
        this.params.max_completion_tokens = this.params.max_tokens;
        delete this.params.max_tokens;
      }

      if (!this.params.max_completion_tokens) {
        this.params.max_completion_tokens = 8000; // Set it lower.
      }

      let completion = await this.groq.chat.completions.create({
        "messages": messages,
        "model": this.model_name || "llama-3.3-70b-versatile",
        "stream": false,
        "stop": stop_seq,
        ...(this.params || {})
      });

      raw_res = completion.choices[0].message;
      res = raw_res.content;
    } catch (err) {
      console.log(err);
      res = "My brain just kinda stopped working. Try again.";
    }

    // Check for <think> tag issues
    const hasOpenTag = res.includes("<think>");
    const hasCloseTag = res.includes("</think>");

    // If a partial <think> block is detected, log a warning and retry
    if (hasOpenTag && !hasCloseTag) {
      console.warn("Partial <think> block detected. Re-generating Groq request...");
      continue; // This will skip the rest of the loop and try again
    }

    // If only the closing tag is present, prepend an opening tag
    if (hasCloseTag && !hasOpenTag) {
      res = '<think>' + res;
    }
    
    // Remove the complete <think> block (and any content inside) from the response
    res = res.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    finalRes = res;
    break; // Exit the loop once a valid response is obtained
  }

  if (finalRes == null) {
    console.warn("Could not obtain a valid <think> block or normal response after max attempts.");
    finalRes = "I thought too hard, sorry, try again.";
  }

  finalRes = finalRes.replace(/<\|separator\|>/g, '*no response*');
  return finalRes;
  }
}
