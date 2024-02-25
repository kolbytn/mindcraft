import { AgentProcess } from './src/process/agent-process.js';

let profile = './andy.json';
let load_memory = false;
let init_message = null;

new AgentProcess().start(profile, load_memory, init_message);