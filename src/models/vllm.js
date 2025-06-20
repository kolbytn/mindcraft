// This code uses Dashscope and HTTP to ensure the latest support for the Qwen model.
// Qwen is also compatible with the OpenAI API format;

// This code uses Dashscope and HTTP to ensure the latest support for the Qwen model.
// Qwen is also compatible with the OpenAI API format;

import OpenAIApi from 'openai';
import { getKey, hasKey } from '../utils/keys.js';
import { strictFormat } from '../utils/text.js';
import { log, logVision } from '../../logger.js';

export class VLLM {
    constructor(model_name, url) {
        this.model_name = model_name;

        // Currently use self-hosted SGLang API for text generation; use OpenAI text-embedding-3-small model for simple embedding.
        let vllm_config = {};
        if (url)
            vllm_config.baseURL = url;
        else
            vllm_config.baseURL = 'http://0.0.0.0:8000/v1';

        vllm_config.apiKey = ""

        this.vllm = new OpenAIApi(vllm_config);
        // VLLM can serve various models. This generic sendRequest does not format for vision.
        // Specific multimodal models served via VLLM might require custom request formatting.
        this.supportsRawImageInput = false;
    }

    async sendRequest(turns, systemMessage, imageData = null, stop_seq = '***') {
        if (imageData) {
            console.warn(`[VLLM] Warning: imageData provided to sendRequest, but this method in vllm.js does not support direct image data embedding for model ${this.model_name}. The image will be ignored. Ensure the VLLM endpoint is configured for a multimodal model and the request is formatted accordingly if vision is intended.`);
        }
        let messages = [{ 'role': 'system', 'content': systemMessage }].concat(turns);
        
        if (this.model_name.includes('deepseek') || this.model_name.includes('qwen')) {
            messages = strictFormat(messages);
        } 

        const pack = {
            model: this.model_name || "deepseek-ai/DeepSeek-R1-Distill-Qwen-32B",
            messages,
            stop: stop_seq,
        };

        let res = null;
        try {
            console.log('Awaiting openai api response...')
            // console.log('Messages:', messages);
            // todo set max_tokens, temperature, top_p, etc. in pack
            let completion = await this.vllm.chat.completions.create(pack);
            if (completion.choices[0].finish_reason == 'length')
                throw new Error('Context length exceeded');
            console.log('Received.')
            res = completion.choices[0].message.content;
        }
        catch (err) {
            if ((err.message == 'Context length exceeded' || err.code == 'context_length_exceeded') && turns.length > 1) {
                console.log('Context length exceeded, trying again with shorter context.');
                return await this.sendRequest(turns.slice(1), systemMessage, imageData, stop_seq);
            } else {
                console.log(err);
                res = 'My brain disconnected, try again.';
            }
        }
        if (typeof res === 'string') {
            res = res.replace(/<thinking>/g, '<think>').replace(/<\/thinking>/g, '</think>');
        }
        log(JSON.stringify(messages), res);
        return res;
    }

    async saveToFile(logFile, logEntry) {
        let task_id = this.agent.task.task_id;
        console.log(task_id)
        let logDir;
        if (this.task_id === null) {
            logDir = path.join(__dirname, `../../bots/${this.agent.name}/logs`);
        } else {
            logDir = path.join(__dirname, `../../bots/${this.agent.name}/logs/${task_id}`);
        }

        await fs.mkdir(logDir, { recursive: true });

        logFile = path.join(logDir, logFile);
        await fs.appendFile(logFile, String(logEntry), 'utf-8');
    }

}