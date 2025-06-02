import { AgentProcess } from './src/process/agent_process.js';
import { createMindServer } from './src/server/mindserver.js';
import { mindserverProxy } from './src/process/mindserver_proxy.js.js';
import { readFileSync } from 'fs';

let mindserver;
let connected = false;

export async function init(host='localhost', port=8080) {
    if (connected) {
        console.error('Already initiliazed!');
        return;
    }
    mindserver = createMindServer(host, port);
    mindserverProxy.connect(host, port);
    connected = true;
}

export async function connect() {
    if (connected) {
        console.error('Already connected!');
        return;
    }
}

export function addWorld(settings) {

}

export async function addAgent(settings) {

}