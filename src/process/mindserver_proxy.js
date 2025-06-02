import { io } from 'socket.io-client';

// Singleton mindserver proxy for the main process
// recieves commands from mindserver
class MindserverProxy {
    constructor() {
        if (MindserverProxy.instance) {
            return MindserverProxy.instance;
        }
        
        this.socket = null;
        this.connected = false;
        this.agent_processes = {};
        MindserverProxy.instance = this;
    }

    connect(host, port) {
        if (this.connected) return;

        this.socket = io(`http://${host}:${port}`);
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

export const mindserverProxy = new MindserverProxy();