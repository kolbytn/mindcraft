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

    async sendRequest(turns, systemMessage, stop_seq=null) {

        let messages = [{"role": "system", "content": systemMessage}].concat(turns); // The standard for GroqCloud is just appending to a messages array starting with the system prompt, but
                                                                                     // this is perfectly acceptable too, and I recommend it. 
                                                                                     // I still feel as though I should note it for any future revisions of MindCraft, though.

        // These variables look odd, but they're for the future. Please keep them intact.
        let raw_res = null;
        let res = null;
        let tool_calls = null;

        try {

            console.log("Awaiting Groq response...");

            if (this.params.max_tokens) {

                console.warn("GROQCLOUD WARNING: A profile is using `max_tokens`. This is deprecated. Please move to `max_completion_tokens`.");
                this.params.max_completion_tokens = this.params.max_tokens;
                delete this.params.max_tokens;

            }

            if (!this.params.max_completion_tokens) {

                this.params.max_completion_tokens = 8000; // Set it lower. This is a common theme.

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

        }

        catch(err) {

            console.log(err);
            res = "My brain just kinda stopped working. Try again.";

        }

        return res;
    }

    async embed(_) {
        throw new Error('Embeddings are not supported by Groq.');
    }
}
