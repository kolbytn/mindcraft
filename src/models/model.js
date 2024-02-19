import { GPT } from './gpt.js';
import { Gemini } from './gemini.js';
import settings from '../settings.js';

console.log('Initializing model...');
let model = null;
if (settings.model.includes('gemini')) {
    model = new Gemini();
} else {
    model = new GPT();
}

export async function sendRequest(turns, systemMessage) {
    return await model.sendRequest(turns, systemMessage);
}

export async function embed(text) {
    return await model.embed(text);
}