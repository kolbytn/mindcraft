/**
 * In-Process Agent Creation
 *
 * Creates agents directly in the same process without spawning child processes.
 * This is used by the orchestrator to create multiple bots that share the same MindServer.
 */

import { Agent } from '../agent/agent.js';
import { setSettings } from '../agent/settings.js';
import { registerAgent, logoutAgent } from './mindserver.js';

/**
 * Create an agent in the same process (no child process spawning)
 *
 * @param {Object} agentSettings - Full settings object for the agent
 * @param {number} agentIndex - Index for this agent (for viewer port)
 * @returns {Promise<{success: boolean, agent: Agent|null, error: string|null}>}
 */
export async function createAgentInProcess(agentSettings, agentIndex = 0) {
    if (!agentSettings.profile?.name) {
        console.error('Agent name is required in profile');
        return {
            success: false,
            agent: null,
            error: 'Agent name is required in profile'
        };
    }

    const agentName = agentSettings.profile.name;
    const viewer_port = 3000 + agentIndex;

    try {
        console.log(`[InProcess] Creating agent '${agentName}' in same process`);

        // Register agent with MindServer
        registerAgent(agentSettings, viewer_port);
        console.log(`[InProcess] Registered '${agentName}' with MindServer`);

        // Set settings for this agent
        // Note: Since settings is a singleton, we need to be careful here
        // For now, we'll create the agent with the current settings
        // TODO: This needs refactoring to support multiple in-process agents properly
        const previousSettings = { ...setSettings };
        setSettings(agentSettings);

        // Create the Agent instance
        const agent = new Agent();

        // Start the agent
        const load_memory = agentSettings.load_memory || false;
        const init_message = agentSettings.init_message || null;
        await agent.start(load_memory, init_message, agentIndex);

        console.log(`[InProcess] Agent '${agentName}' started successfully`);

        return {
            success: true,
            agent: agent,
            error: null
        };

    } catch (error) {
        console.error(`[InProcess] Failed to create agent '${agentName}':`, error);

        // Cleanup on failure
        try {
            logoutAgent(agentName);
        } catch (cleanupError) {
            console.error(`[InProcess] Cleanup error:`, cleanupError);
        }

        return {
            success: false,
            agent: null,
            error: error.message
        };
    }
}

/**
 * Track active in-process agents
 */
const inProcessAgents = new Map();

/**
 * Store an in-process agent
 */
export function storeInProcessAgent(name, agent) {
    inProcessAgents.set(name, agent);
}

/**
 * Get an in-process agent by name
 */
export function getInProcessAgent(name) {
    return inProcessAgents.get(name);
}

/**
 * Stop an in-process agent
 */
export function stopInProcessAgent(name) {
    const agent = inProcessAgents.get(name);
    if (agent) {
        agent.cleanKill('Agent stopped');
        inProcessAgents.delete(name);
        logoutAgent(name);
    }
}
