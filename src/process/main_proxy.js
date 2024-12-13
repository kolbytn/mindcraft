import { io } from 'socket.io-client';
import settings from '../../settings.js';

// Singleton mindserver proxy for the main process
class MainProxy {
    constructor() {
        if (MainProxy.instance) {
            return MainProxy.instance;
        }
        
        this.socket = null;
        this.connected = false;
        this.agent_processes = {};
        MainProxy.instance = this;
    }

    connect() {
        if (this.connected) return;

        this.socket = io(`http://${settings.mindserver_host}:${settings.mindserver_port}`);
        this.connected = true;

        this.socket.on('stop-agent', (agentName) => {
            if (this.agent_processes[agentName]) {
                this.agent_processes[agentName].stop();
            }
        });

        this.socket.on('start-agent', (agentName) => {
            if (this.agent_processes[agentName]) {
                this.agent_processes[agentName].continue();
            }
        });

        this.socket.on('register-agents-success', () => {
            console.log('Agents registered');
        });

        this.socket.on('shutdown', () => {
            console.log('Shutting down');
            for (let agentName in this.agent_processes) {
                this.agent_processes[agentName].stop();
            }
            setTimeout(() => {
                process.exit(0);
            }, 2000);
        });
    }

    addAgent(agent) {
        this.agent_processes.push(agent);
    }

    logoutAgent(agentName) {
        this.socket.emit('logout-agent', agentName);
    }

    registerAgent(name, process) {
        this.socket.emit('register-agents', [name]);
        this.agent_processes[name] = process;
    }
}

export const mainProxy = new MainProxy();