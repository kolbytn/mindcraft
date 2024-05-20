import { AgentProcess } from './src/process/agent-process.js';

let profiles = ['./profiles/gpt.json', './profiles/claude.json', './profiles/llama.json', './profiles/gemini.json'];

profiles = ['./profiles/llama.json'];
let load_memory = false;
let init_message = 'Say hello world and your name.';

for (let profile of profiles)
    new AgentProcess().start(profile, load_memory, init_message);