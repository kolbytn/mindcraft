import { createMindServer, registerAgent } from './mindserver.js';
import { AgentProcess } from '../process/agent_process.js';

let mindserver;
let connected = false;
let agent_processes = {};
let agent_count = 0;
let host = 'localhost';
let port = 8080;

export async function init(host_public=false, port=8080) {
    if (connected) {
        console.error('Already initiliazed!');
        return;
    }
    mindserver = createMindServer(host_public, port);
    port = port;
    connected = true;
}

export async function createAgent(settings) {
    if (!settings.profile.name) {
        console.error('Agent name is required in profile');
        return;
    }
    settings = JSON.parse(JSON.stringify(settings));
    let agent_name = settings.profile.name;
    registerAgent(settings);
    let load_memory = settings.load_memory || false;
    let init_message = settings.init_message || null;
    const agentProcess = new AgentProcess(agent_name, port);
    agentProcess.start(load_memory, init_message, agent_count);
    agent_count++;
    agent_processes[settings.profile.name] = agentProcess;
}

export function getAgentProcess(agentName) {
    return agent_processes[agentName];
}

export function startAgent(agentName) {
    if (agent_processes[agentName]) {
        agent_processes[agentName].continue();
    }
    else {
        console.error(`Cannot start agent ${agentName}; not found`);
    }
}

export function stopAgent(agentName) {
    if (agent_processes[agentName]) {
        agent_processes[agentName].stop();
    }
}

export function shutdown() {
    console.log('Shutting down');
    for (let agentName in agent_processes) {
        agent_processes[agentName].stop();
    }
    setTimeout(() => {
        process.exit(0);
    }, 2000);
}
