import { io } from 'socket.io-client';
import convoManager from './conversation.js';
import { setSettings } from './settings.js';
import { getFullState } from './library/full_state.js';

// agent's individual connection to the mindserver
// always connect to localhost

class MindServerProxy {
    constructor() {
        if (MindServerProxy.instance) {
            return MindServerProxy.instance;
        }
        
        this.socket = null;
        this.connected = false;
        this.agents = [];
        MindServerProxy.instance = this;
    }

    async connect(name, urlOrPort, remoteSettings = null) {
        if (this.connected) return;

        this.name = name;
        const url = (typeof urlOrPort === 'string' && urlOrPort.startsWith('http'))
            ? urlOrPort
            : `http://localhost:${urlOrPort}`;
        this.socket = io(url);

        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`MindServer connection timed out after 30s (${url})`));
            }, 30000);
            this.socket.on('connect', () => {
                clearTimeout(timeout);
                resolve();
            });
            this.socket.on('connect_error', (err) => {
                clearTimeout(timeout);
                console.error('Connection failed:', err);
                reject(err);
            });
        });

        this.connected = true;
        console.log(name, 'connected to MindServer');

        this.socket.on('disconnect', () => {
            console.log('Disconnected from MindServer');
            this.connected = false;
            if (this.agent) {
                this.agent.cleanKill('Disconnected from MindServer. Killing agent process.');
            }
        });

        this.socket.on('chat-message', (agentName, json) => {
            convoManager.receiveFromBot(agentName, json);
        });

        this.socket.on('agents-status', (agents) => {
            this.agents = agents;
            convoManager.updateAgents(agents);
            if (this.agent?.task) {
                console.log(this.agent.name, 'updating available agents');
                this.agent.task.updateAvailableAgents(agents);
            }
        });

        this.socket.on('restart-agent', (agentName) => {
            // Ignore unnamed/broadcast restarts (e.g. from stale UI settings updates)
            if (!agentName) {
                console.log('Ignoring unnamed restart-agent event');
                return;
            }
            if (agentName !== this.agent.name) return;
            console.log(`Restarting agent: ${this.agent.name}`);
            this.agent.cleanKill();
        });
		
        this.socket.on('send-message', (data) => {
            try {
                this.agent.respondFunc(data.from, data.message);
            } catch (error) {
                console.error('Error: ', JSON.stringify(error, Object.getOwnPropertyNames(error)));
            }
        });

        this.socket.on('get-full-state', (callback) => {
            try {
                const state = getFullState(this.agent);
                callback(state);
            } catch (error) {
                console.error('Error getting full state:', error);
                callback(null);
            }
        });

        this.socket.on('get-usage', (callback) => {
            try {
                const snapshot = this.agent?.prompter?.usageTracker?.getSnapshot() || null;
                callback(snapshot);
            } catch (error) {
                console.error('Error getting usage:', error);
                callback(null);
            }
        });

        if (remoteSettings) {
            // Remote mode: register ourselves on the remote MindServer
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Remote agent registration timed out after 10s'));
                }, 10000);
                this.socket.emit('register-remote-agent', remoteSettings, (response) => {
                    clearTimeout(timeout);
                    if (response.error) return reject(new Error(response.error));
                    setSettings(response.settings);
                    this.socket.emit('connect-agent-process', name);
                    resolve();
                });
            });
        } else {
            // Local mode: request settings from MindServer
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Settings request timed out after 5 seconds'));
                }, 5000);
                this.socket.emit('get-settings', name, (response) => {
                    clearTimeout(timeout);
                    if (response.error) return reject(new Error(response.error));
                    setSettings(response.settings);
                    this.socket.emit('connect-agent-process', name);
                    resolve();
                });
            });
        }
    }

    setAgent(agent) {
        this.agent = agent;
    }

    getAgents() {
        return this.agents;
    }

    getNumOtherAgents() {
        return this.agents.length - 1;
    }

    login() {
        this.socket.emit('login-agent', this.agent.name);
    }

    shutdown() {
        this.socket.emit('shutdown');
    }

    getSocket() {
        return this.socket;
    }
}

// Create and export a singleton instance
export const serverProxy = new MindServerProxy();

// for chatting with other bots
export function sendBotChatToServer(agentName, json) {
    serverProxy.getSocket().emit('chat-message', agentName, json);
}

// for sending general output to server for display
export function sendOutputToServer(agentName, message) {
    serverProxy.getSocket().emit('bot-output', agentName, message);
}
