import { Server } from 'socket.io';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import * as mindcraft from './mindcraft.js';
import { readFileSync, existsSync } from 'fs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Mindserver is:
// - central hub for communication between all agent processes
// - api to control from other languages and remote users 
// - host for webapp

let io;
let server;
const agent_connections = {};
const agent_listeners = [];

const settings_spec = JSON.parse(readFileSync(path.join(__dirname, 'public/settings_spec.json'), 'utf8'));

function readUsageFromDisk(agentName) {
    try {
        const filePath = path.join(__dirname, `../../bots/${agentName}/usage.json`);
        if (!existsSync(filePath)) return null;
        const raw = readFileSync(filePath, 'utf8');
        const data = JSON.parse(raw);
        // Disk data won't have live RPM/TPM
        data.rpm = 0;
        data.tpm = 0;
        return data;
    } catch {
        return null;
    }
}

class AgentConnection {
    constructor(settings, viewer_port) {
        this.socket = null;
        this.settings = settings;
        this.in_game = false;
        this.full_state = null;
        this.viewer_port = viewer_port;
        this.loginTime = null;
    }
    setSettings(settings) {
        this.settings = settings;
    }
}

export function registerAgent(settings, viewer_port) {
    let agentConnection = new AgentConnection(settings, viewer_port);
    agent_connections[settings.profile.name] = agentConnection;
}

export function logoutAgent(agentName) {
    if (agent_connections[agentName]) {
        agent_connections[agentName].in_game = false;
        agent_connections[agentName].loginTime = null;
        agentsStatusUpdate();
    }
}

// Initialize the server
export function createMindServer(host_public = false, port = 8080) {
    const app = express();
    server = http.createServer(app);
    io = new Server(server);

    // Serve static files
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    app.use(express.static(path.join(__dirname, 'public')));

    // Socket.io connection handling
    io.on('connection', (socket) => {
        let curAgentName = null;
        console.log('Client connected');

        agentsStatusUpdate(socket);

        socket.on('create-agent', async (settings, callback) => {
            console.log('API create agent...');
            for (let key in settings_spec) {
                if (!(key in settings)) {
                    if (settings_spec[key].required) {
                        callback({ success: false, error: `Setting ${key} is required` });
                        return;
                    }
                    else {
                        settings[key] = settings_spec[key].default;
                    }
                }
            }
            for (let key in settings) {
                if (!(key in settings_spec)) {
                    delete settings[key];
                }
            }
            if (settings.profile?.name) {
                if (settings.profile.name in agent_connections) {
                    callback({ success: false, error: 'Agent already exists' });
                    return;
                }
                let returned = await mindcraft.createAgent(settings);
                callback({ success: returned.success, error: returned.error });
                let name = settings.profile.name;
                if (!returned.success && agent_connections[name]) {
                    mindcraft.destroyAgent(name);
                    delete agent_connections[name];
                }
                agentsStatusUpdate();
            }
            else {
                console.error('Agent name is required in profile');
                callback({ success: false, error: 'Agent name is required in profile' });
            }
        });

        socket.on('get-settings', (agentName, callback) => {
            if (agent_connections[agentName]) {
                callback({ settings: agent_connections[agentName].settings });
            } else {
                callback({ error: `Agent '${agentName}' not found.` });
            }
        });

        socket.on('connect-agent-process', (agentName) => {
            if (agent_connections[agentName]) {
                agent_connections[agentName].socket = socket;
                agentsStatusUpdate();
            }
        });

        // Remote agent registration: allows an agent process running on another
        // machine to register itself and appear in the MindServer UI.
        socket.on('register-remote-agent', (agentSettings, callback) => {
            const name = agentSettings?.profile?.name;
            if (!name) {
                callback({ error: 'Agent name is required in profile' });
                return;
            }
            if (agent_connections[name]) {
                // Already registered — update settings from remote agent
                // (remote agent may have different host/port than the server's own)
                agent_connections[name].setSettings(agentSettings);
                console.log(`Remote agent '${name}' re-registered (settings updated)`);
                callback({ settings: agent_connections[name].settings });
                agentsStatusUpdate();
                return;
            }
            const viewerPort = 3000 + Object.keys(agent_connections).length;
            registerAgent(agentSettings, viewerPort);
            console.log(`Remote agent '${name}' registered on MindServer`);
            callback({ settings: agent_connections[name].settings });
            agentsStatusUpdate();
        });

        socket.on('login-agent', (agentName) => {
            if (agent_connections[agentName]) {
                agent_connections[agentName].socket = socket;
                agent_connections[agentName].in_game = true;
                agent_connections[agentName].loginTime = Date.now();
                curAgentName = agentName;
                agentsStatusUpdate();
            }
            else {
                console.warn(`Unregistered agent ${agentName} tried to login`);
            }
        });

        socket.on('disconnect', () => {
            if (agent_connections[curAgentName]) {
                console.log(`Agent ${curAgentName} disconnected`);
                agent_connections[curAgentName].in_game = false;
                agent_connections[curAgentName].loginTime = null;
                agent_connections[curAgentName].socket = null;
                agentsStatusUpdate();
            }
            if (agent_listeners.includes(socket)) {
                removeListener(socket);
            }
        });

        socket.on('chat-message', (agentName, json) => {
            if (!agent_connections[agentName]) {
                console.warn(`Agent ${agentName} tried to send a message but is not logged in`);
                return;
            }
            if (!agent_connections[agentName].socket) {
                console.warn(`Agent ${agentName} has no socket connection`);
                return;
            }
            console.log(`${curAgentName} sending message to ${agentName}: ${json.message}`);
            agent_connections[agentName].socket.emit('chat-message', curAgentName, json);
        });

        socket.on('set-agent-settings', (agentName, settings) => {
            const agent = agent_connections[agentName];
            if (agent) {
                agent.setSettings(settings);
                if (!agent.socket) {
                    console.warn(`Cannot restart agent ${agentName} after settings update: no socket connection`);
                    return;
                }
                agent.socket.emit('restart-agent');
            }
        });

        socket.on('restart-agent', (agentName) => {
            console.log(`Restarting agent: ${agentName}`);
            if (!agent_connections[agentName]?.socket) {
                console.warn(`Cannot restart agent ${agentName}: no socket connection`);
                return;
            }
            agent_connections[agentName].socket.emit('restart-agent');
        });

        socket.on('stop-agent', (agentName) => {
            mindcraft.stopAgent(agentName);
        });

        socket.on('start-agent', (agentName) => {
            mindcraft.startAgent(agentName);
        });

        socket.on('destroy-agent', (agentName) => {
            if (agent_connections[agentName]) {
                mindcraft.destroyAgent(agentName);
                delete agent_connections[agentName];
            }
            agentsStatusUpdate();
        });

        socket.on('stop-all-agents', () => {
            console.log('Killing all agents');
            for (let agentName in agent_connections) {
                mindcraft.stopAgent(agentName);
            }
        });

        socket.on('shutdown', () => {
            console.log('Shutting down');
            for (let agentName in agent_connections) {
                mindcraft.stopAgent(agentName);
            }
            // wait 2 seconds
            setTimeout(() => {
                console.log('Exiting MindServer');
                process.exit(0);
            }, 2000);
            
        });

		socket.on('send-message', (agentName, data) => {
			if (!agent_connections[agentName]) {
				console.warn(`Agent ${agentName} not in game, cannot send message via MindServer.`);
				return;
			}
			try {
				agent_connections[agentName].socket.emit('send-message', data);
			} catch (error) {
				console.error('Error: ', error);
			}
		});

        socket.on('bot-output', (agentName, message) => {
            io.emit('bot-output', agentName, message);
        });

        socket.on('listen-to-agents', () => {
            addListener(socket);
        });

        socket.on('get-agent-usage', (agentName, callback) => {
            const conn = agent_connections[agentName];
            // If agent is in-game, query live data with disk fallback on timeout
            if (conn && conn.socket && conn.in_game) {
                const timeout = setTimeout(() => {
                    const diskData = readUsageFromDisk(agentName);
                    callback(diskData ? { usage: diskData } : { error: 'Timeout' });
                }, 5000);
                conn.socket.emit('get-usage', (data) => {
                    clearTimeout(timeout);
                    callback({ usage: data });
                });
                return;
            }
            // Agent offline or not registered — try reading from disk
            const diskData = readUsageFromDisk(agentName);
            if (diskData) {
                callback({ usage: diskData });
            } else {
                callback({ error: `No usage data for '${agentName}'.` });
            }
        });

        socket.on('get-all-usage', (callback) => {
            const results = {};
            const promises = [];
            for (const agentName in agent_connections) {
                const conn = agent_connections[agentName];
                if (conn.socket && conn.in_game) {
                    // Live agent — query via socket
                    promises.push(new Promise((resolve) => {
                        const timeout = setTimeout(() => {
                            // Fallback to disk on timeout
                            const diskData = readUsageFromDisk(agentName);
                            if (diskData) results[agentName] = diskData;
                            resolve();
                        }, 3000);
                        conn.socket.emit('get-usage', (data) => {
                            clearTimeout(timeout);
                            results[agentName] = data;
                            resolve();
                        });
                    }));
                } else {
                    // Offline agent — read from disk
                    const diskData = readUsageFromDisk(agentName);
                    if (diskData) results[agentName] = diskData;
                }
            }
            Promise.all(promises).then(() => callback(results));
        });
    });

    // Health check endpoint
    app.get('/health', (req, res) => {
        res.status(200).json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            agents: Object.keys(agent_connections).length
        });
    });

    let host = host_public ? '0.0.0.0' : 'localhost';
    server.listen(port, host, () => {
        console.log(`MindServer running on port ${port}`);
    });

    return server;
}

function agentsStatusUpdate(socket) {
    if (!socket) {
        socket = io;
    }
    let agents = [];
    for (let agentName in agent_connections) {
        const conn = agent_connections[agentName];
        agents.push({
            name: agentName,
            in_game: conn.in_game,
            viewerPort: conn.viewer_port,
            socket_connected: !!conn.socket,
            loginTime: conn.loginTime || null
        });
    };
    socket.emit('agents-status', agents);
}


let listenerInterval = null;
function addListener(listener_socket) {
    agent_listeners.push(listener_socket);
    if (agent_listeners.length === 1) {
        listenerInterval = setInterval(async () => {
            const states = {};
            for (let agentName in agent_connections) {
                let agent = agent_connections[agentName];
                if (agent.in_game) {
                    try {
                        const state = await new Promise((resolve) => {
                            agent.socket.emit('get-full-state', (s) => resolve(s));
                        });
                        states[agentName] = state;
                    } catch (e) {
                        states[agentName] = { error: String(e) };
                    }
                }
            }
            for (let listener of agent_listeners) {
                listener.emit('state-update', states);
            }
        }, 1000);
    }
}

function removeListener(listener_socket) {
    agent_listeners.splice(agent_listeners.indexOf(listener_socket), 1);
    if (agent_listeners.length === 0) {
        clearInterval(listenerInterval);
        listenerInterval = null;
    }
}

// Optional: export these if you need access to them from other files
export const getIO = () => io;
export const getServer = () => server;
export const numStateListeners = () => agent_listeners.length;