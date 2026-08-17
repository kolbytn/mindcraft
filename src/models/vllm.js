import { strictFormat } from '../utils/text.js';
import { OpenAICompatibleChat } from './openai_compatible.js';

function formatVllmMessages(messages, model) {
    if (model?.includes('deepseek') || model?.includes('qwen')) {
        return strictFormat(messages);
    }
    return messages;
}

export class VLLM extends OpenAICompatibleChat {
    static prefix = 'vllm';

    constructor(model_name, url, params) {
        super({
            model_name,
            url,
            params,
            apiKey: '',
            defaultURL: 'http://0.0.0.0:8000/v1',
            defaultModel: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-32B',
            logName: 'vLLM',
            formatMessages: formatVllmMessages,
        });
    }
}
