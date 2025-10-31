/**
 * Coordination Module for Multi-Bot Tasks
 *
 * Provides hybrid coordination system:
 * - File-based: Bots read/write context files
 * - Chat-based: Bots communicate via in-game chat
 */

import { writeFile, readFile, existsSync } from 'fs';
import path from 'path';
import { promisify } from 'util';

const writeFileAsync = promisify(writeFile);
const readFileAsync = promisify(readFile);

export class CoordinationManager {
    constructor(agentsDir) {
        this.agentsDir = agentsDir;
        this.chatHistoryPath = path.join(agentsDir, 'chat-history.json');
        this.chatHistory = [];
    }

    /**
     * Initialize coordination system
     */
    async init() {
        // Load existing chat history if it exists
        if (existsSync(this.chatHistoryPath)) {
            const content = await readFileAsync(this.chatHistoryPath, 'utf-8');
            this.chatHistory = JSON.parse(content);
        } else {
            this.chatHistory = [];
            await this.saveChatHistory();
        }
    }

    /**
     * Log a chat message from a bot
     *
     * @param {string} botName - Name of the bot sending message
     * @param {string} message - The message content
     * @param {string} targetBot - Optional target bot (for direct messages)
     */
    async logChatMessage(botName, message, targetBot = null) {
        const entry = {
            timestamp: Date.now(),
            from: botName,
            to: targetBot || 'all',
            message: message
        };

        this.chatHistory.push(entry);
        await this.saveChatHistory();

        return entry;
    }

    /**
     * Get recent chat messages
     *
     * @param {string} botName - Optional: filter by messages relevant to this bot
     * @param {number} limit - Maximum number of messages to return
     */
    async getChatHistory(botName = null, limit = 50) {
        let messages = this.chatHistory;

        // Filter by bot if specified
        if (botName) {
            messages = messages.filter(m =>
                m.to === 'all' ||
                m.to === botName ||
                m.from === botName
            );
        }

        // Return most recent messages
        return messages.slice(-limit);
    }

    /**
     * Parse coordination commands from chat
     *
     * Examples:
     * - "@builder-1: place blocks at 100 64 200"
     * - "@all: foundation complete, starting walls"
     */
    parseCoordinationCommand(message) {
        // Check for directed message: @botname: message
        const directedMatch = message.match(/^@([a-z0-9-]+):\s*(.+)$/i);
        if (directedMatch) {
            return {
                type: 'directed',
                target: directedMatch[1],
                message: directedMatch[2]
            };
        }

        // Check for status update: [STATUS] message
        const statusMatch = message.match(/^\[([A-Z]+)\]\s*(.+)$/);
        if (statusMatch) {
            return {
                type: 'status',
                status: statusMatch[1],
                message: statusMatch[2]
            };
        }

        // Regular message
        return {
            type: 'chat',
            message: message
        };
    }

    /**
     * Read a context file
     *
     * @param {string} filename - Name of file in .mindcraft-agents/context/
     */
    async readContextFile(filename) {
        const filePath = path.join(this.agentsDir, 'context', filename);

        if (!existsSync(filePath)) {
            throw new Error(`Context file not found: ${filename}`);
        }

        return await readFileAsync(filePath, 'utf-8');
    }

    /**
     * Write a context file
     *
     * @param {string} filename - Name of file in .mindcraft-agents/context/
     * @param {string} content - Content to write
     */
    async writeContextFile(filename, content) {
        const filePath = path.join(this.agentsDir, 'context', filename);
        await writeFileAsync(filePath, content);
    }

    /**
     * Check if a bot has completed its task
     *
     * @param {string} botId - Bot ID to check
     */
    isBotComplete(botId) {
        const donePath = path.join(this.agentsDir, 'logs', `${botId}.done`);
        return existsSync(donePath);
    }

    /**
     * Get coordination state for a bot
     *
     * Returns info about what the bot should know:
     * - Recent chat messages
     * - Available context files
     * - Status of other bots
     */
    async getCoordinationState(botName) {
        const state = {
            botName,
            timestamp: Date.now(),
            recentChat: await this.getChatHistory(botName, 10),
            contextFiles: [],
            otherBots: []
        };

        // List available context files
        const contextDir = path.join(this.agentsDir, 'context');
        if (existsSync(contextDir)) {
            const fs = await import('fs/promises');
            const files = await fs.readdir(contextDir);
            state.contextFiles = files.filter(f => f.endsWith('.md') || f.endsWith('.json'));
        }

        return state;
    }

    /**
     * Save chat history to disk
     */
    async saveChatHistory() {
        await writeFileAsync(
            this.chatHistoryPath,
            JSON.stringify(this.chatHistory, null, 2)
        );
    }

    /**
     * Clear old chat history (cleanup)
     *
     * @param {number} maxAge - Maximum age in milliseconds
     */
    async clearOldMessages(maxAge = 3600000) {
        const cutoff = Date.now() - maxAge;
        this.chatHistory = this.chatHistory.filter(m => m.timestamp > cutoff);
        await this.saveChatHistory();
    }
}

/**
 * Helper function for bots to announce status
 *
 * Usage in bot code:
 * announceStatus("Starting foundation")
 * announceStatus("50% complete")
 * announceStatus("Task complete")
 */
export function announceStatus(agent, status) {
    return agent.bot.chat(`[STATUS] ${status}`);
}

/**
 * Helper function for bots to send directed messages
 *
 * Usage in bot code:
 * sendDirectedMessage(agent, "builder-2", "Wait for me to finish foundation")
 */
export function sendDirectedMessage(agent, targetBot, message) {
    return agent.bot.chat(`@${targetBot}: ${message}`);
}

/**
 * Helper function for bots to broadcast to all
 *
 * Usage in bot code:
 * broadcastMessage(agent, "Foundation complete!")
 */
export function broadcastMessage(agent, message) {
    return agent.bot.chat(`@all: ${message}`);
}
