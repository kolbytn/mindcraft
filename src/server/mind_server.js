import { Server } from 'socket.io';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

// Module-level variables
let io;
let server;
const connectedAgents = {};

// Initialize the server
export function createMindServer(port = 8080) {
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

        socket.emit('agents-update', Object.keys(connectedAgents));

        socket.on('register-agent', (agentName) => {
            console.log('Agent registered:', agentName);
            connectedAgents[agentName] = socket;
            curAgentName = agentName;
            io.emit('agents-update', Object.keys(connectedAgents));
        });

        socket.on('chat-message', (agentName, json) => {
            console.log(`${curAgentName} received message from ${agentName}: ${json}`);
            const agentSocket = connectedAgents[agentName];
            if (agentSocket) {
                agentSocket.emit('chat-message', curAgentName, json);
            }
        });

        socket.on('disconnect', () => {
            console.log('Client disconnected');
            delete connectedAgents[socket.id];
            io.emit('agents-update', Object.keys(connectedAgents));
        });
    });

    server.listen(port, 'localhost', () => {
        console.log(`MindServer running on port ${port}`);
    });

    return server;
}
// Optional: export these if you need access to them from other files
export const getIO = () => io;
export const getServer = () => server;
export const getConnectedAgents = () => connectedAgents; 