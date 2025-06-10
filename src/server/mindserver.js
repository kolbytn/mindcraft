import { Server } from 'socket.io';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import * as mindcraft from '../../mindcraft.js';

// Mindserver is:
// - central hub for communication between all agent processes
// - api to control from other languages and remote users 
// - host for webapp

// Module-level variables
let io;
let server;
const agent_connections = {};

class AgentConnection {
    constructor(settings) {
        this.socket = null;
        this.settings = settings;
        this.in_game = false;
    }
    
}

export function registerAgent(settings) {
    let agentConnection = new AgentConnection(settings);
    agent_connections[settings.profile.name] = agentConnection;
}

export function logoutAgent(agentName) {
    if (agent_connections[agentName]) {
        agent_connections[agentName].in_game = false;
        agentsUpdate();
    }
}

// Initialize the server
export function createMindServer(host = 'localhost', port = 8080) {
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

        agentsUpdate(socket);

        socket.on('get-settings', (agentName, callback) => {
            if (agent_connections[agentName]) {
                callback({ settings: agent_connections[agentName].settings });
            } else {
                callback({ error: `Agent '${agentName}' not found.` });
            }
        });

        socket.on('login-agent', (agentName) => {
            if (agent_connections[agentName]) {
                agent_connections[agentName].socket = socket;
                agent_connections[agentName].in_game = true;
                curAgentName = agentName;
                agentsUpdate();
            }
            else {
                console.warn(`Unregistered agent ${agentName} tried to login`);
            }
        });

        socket.on('logout-agent', (agentName) => {
            if (agent_connections[agentName]) {
                agent_connections[agentName].in_game = false;
                agentsUpdate();
            }
        });

        socket.on('disconnect', () => {
            console.log('Client disconnected');
            if (agent_connections[curAgentName]) {
                agent_connections[curAgentName].in_game = false;
                agentsUpdate();
            }
        });

        socket.on('chat-message', (agentName, json) => {
            if (!agent_connections[agentName]) {
                console.warn(`Agent ${agentName} tried to send a message but is not logged in`);
                return;
            }
            console.log(`${curAgentName} sending message to ${agentName}: ${json.message}`);
            agent_connections[agentName].socket.emit('chat-message', curAgentName, json);
        });

        socket.on('restart-agent', (agentName) => {
            console.log(`Restarting agent: ${agentName}`);
            agent_connections[agentName].socket.emit('restart-agent');
        });

        socket.on('stop-agent', (agentName) => {
            mindcraft.stopAgent(agentName);
        });

        socket.on('start-agent', (agentName) => {
            mindcraft.startAgent(agentName);
        });

        socket.on('stop-all-agents', () => {
            console.log('Killing all agents');
            for (let agentName in agent_connections) {
                mindcraft.stopAgent(agentName);
            }
        });

        socket.on('shutdown', () => {
            console.log('Shutting down');
            process.exit(0);
        });

		socket.on('send-message', (agentName, message) => {
			if (!agent_connections[agentName]) {
				console.warn(`Agent ${agentName} not in game, cannot send message via MindServer.`);
				return
			}
			try {
				console.log(`Sending message to agent ${agentName}: ${message}`);
				agent_connections[agentName].socket.emit('send-message', agentName, message)
			} catch (error) {
				console.error('Error: ', error);
			}
		});
    });

    server.listen(port, host, () => {
        console.log(`MindServer running on port ${port}`);
    });

    return server;
}

function agentsUpdate(socket) {
    if (!socket) {
        socket = io;
    }
    let agents = [];
    for (let agentName in agent_connections) {
        agents.push({name: agentName, in_game: agent_connections[agentName].in_game});
    };
    socket.emit('agents-update', agents);
}

// Optional: export these if you need access to them from other files
export const getIO = () => io;
export const getServer = () => server;
