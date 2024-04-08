import { AgentProcess } from './src/process/agent-process.js';

let profile = './andy.json';
let load_memory = false;
let init_message = 'Say hello world and your name. Do NOT use any command yet, nor make any comment about that fact.';

new AgentProcess().start(profile, load_memory, init_message);