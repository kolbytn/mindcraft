import { AzureOpenAI } from "openai";
import { getKey } from '../utils/keys.js';
import { GPT } from './gpt.js'

export class AzureGPT extends GPT {
    constructor(model_name, url, api_version, params) {
        super(model_name, url)

        this.model_name = model_name;
        this.params = params;

        let config = {}

        if (url)
            config.endpoint = url;

        config.apiKey = getKey('OPENAI_API_KEY');
        config.deployment = model_name; // This must be what you named the deployment in Azure, not the model version itself
        config.apiVersion = api_version; // This is required for Azure

        this.openai = new AzureOpenAI(config)
    }
}