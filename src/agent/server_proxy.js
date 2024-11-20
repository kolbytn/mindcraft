import { io } from 'socket.io-client';
import { recieveFromBot, updateAgents } from './conversation.js';
import settings from '../../settings.js';

class ServerProxy {
    constructor() {
        if (ServerProxy.instance) {
            return ServerProxy.instance;
        }
        
        this.socket = null;
        this.connected = false;
        ServerProxy.instance = this;
    }

    connect() {
        if (this.connected) return;
        
        this.socket = io(`http://${settings.mindserver_host}:${settings.mindserver_port}`);
        this.connected = true;

        this.socket.on('connect', () => {
            console.log('Connected to MindServer');
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from MindServer');
            this.connected = false;
        });

        this.socket.on('chat-message', (agentName, json) => {
            recieveFromBot(agentName, json);
        });

        this.socket.on('agents-update', (agents) => {
            updateAgents(agents);
        });
    }

    registerAgent(agentName) {
        if (!this.connected) {
            console.warn('Cannot register agent: not connected to MindServer');
            return;
        }
        this.socket.emit('register-agent', agentName);
    }

    getSocket() {
        return this.socket;
    }
}

// Create and export a singleton instance
export const serverProxy = new ServerProxy();

export function sendBotChatToServer(agentName, json) {
    serverProxy.getSocket().emit('chat-message', agentName, json);
}
