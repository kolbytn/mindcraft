import OpenAIApi from 'openai';
import { strictFormat } from '../utils/text.js';

export class OpenAICompatibleChat {
    constructor({
        model_name,
        url,
        params,
        apiKey,
        defaultURL,
        defaultModel,
        logName = 'OpenAI-compatible',
        formatMessages = strictFormat,
    }) {
        this.model_name = model_name;
        this.params = params;
        this.defaultModel = defaultModel;
        this.logName = logName;
        this.formatMessages = formatMessages;
        this.openai = new OpenAIApi({
            baseURL: url || defaultURL,
            apiKey,
        });
    }

    async sendRequest(turns, systemMessage, stop_seq = '***') {
        let messages = [{ role: 'system', content: systemMessage }].concat(turns);
        if (this.formatMessages) {
            messages = this.formatMessages(messages, this.model_name || this.defaultModel);
        }

        const pack = {
            model: this.model_name || this.defaultModel,
            messages,
            stop: stop_seq,
            ...(this.params || {}),
        };

        try {
            console.log(`Awaiting ${this.logName} api response...`);
            const completion = await this.openai.chat.completions.create(pack);
            console.log('Received.');

            const choice = completion.choices?.[0];
            const content = choice?.message?.content ?? '';
            if (choice?.finish_reason === 'length') {
                // `length` means the generation hit an output/token limit; it
                // does not prove that the input context overflowed. Preserve
                // the useful partial completion instead of dropping history.
                console.warn(`${this.logName} response reached its output token limit.`);
            }
            return content;
        }
        catch (err) {
            if (err?.code === 'context_length_exceeded' && turns.length > 1) {
                console.log('Context length exceeded, trying again with shorter context.');
                return this.sendRequest(turns.slice(1), systemMessage, stop_seq);
            }

            console.log(err);
            return 'My brain disconnected, try again.';
        }
    }
}
