import { AgentProcess } from './src/process/agent-process.js';

let profile = './radley.json';
let load_memory = false;
let init_message = 'Say hello world and your name.';

new AgentProcess().start(profile, load_memory, init_message);