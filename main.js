import { AgentProcess } from './src/process/agent-process.js';
import settings from './settings.js';

let profiles = settings.profiles;
let load_memory = settings.load_memory;
let init_message = settings.init_message;

for (let profile of profiles)
    new AgentProcess().start(profile, load_memory, init_message);