import { AgentProcess } from './src/process/agent-process.js';
import settings from './settings.js';
import { generateProfiles } from './src/profileGenerator.js';

const numBots = process.argv[2] ? parseInt(process.argv[2], 10) : 10; // Default to 10 bots if not specified

const profiles = generateProfiles(numBots);
settings.profiles = profiles;

let load_memory = settings.load_memory;
let init_message = settings.init_message;

for (let profile of profiles) {
    new AgentProcess().start(profile, load_memory, init_message);
}