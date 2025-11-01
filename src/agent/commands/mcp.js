/**
 * MCP-style commands for Context Foundry integration
 *
 * These commands allow Andy (and other bots) to use context-foundry MCP server
 * to delegate tasks to helper agents (spawned Claude Code instances).
 */

import { spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { BotOrchestrator } from '../../orchestration/bot_orchestrator.js';
import { SurvivalOrchestrator } from '../../orchestration/survival_orchestrator.js';
import { getGlobalResourceMap } from '../../orchestration/resource_map.js';
import settings from '../../../settings.js';
import * as Mindcraft from '../../mindcraft/mindcraft.js';

// Track active helper agents
const activeAgents = new Map();

// Global bot orchestrator instance
let botOrchestrator = null;
let survivalOrchestrator = null;

/**
 * Get or create bot orchestrator instance
 */
function getOrchestrator() {
    if (!botOrchestrator) {
        botOrchestrator = new BotOrchestrator();
    }
    return botOrchestrator;
}

/**
 * Get or create survival orchestrator instance
 */
function getSurvivalOrchestrator(agent) {
    if (!survivalOrchestrator) {
        survivalOrchestrator = new SurvivalOrchestrator(agent);
    }
    return survivalOrchestrator;
}

/**
 * Summon a helper agent to work on a task in the background
 *
 * @param {string} task - Description of what the helper should do
 * @param {string} name - Optional name for the helper (e.g., "builder", "miner")
 * @returns {string} - Agent ID and status
 */
async function summonAgent(agent, task, helperName = null) {
    const agentId = helperName || `helper-${uuidv4().slice(0, 8)}`;

    // Use context-foundry MCP to delegate task
    const command = `
Please use the context-foundry MCP tool 'delegate_to_claude_code_async' to start this task:

Task: ${task}
Working Directory: ${process.cwd()}
Timeout: 30 minutes

Return the task_id so I can check on it later.
    `.trim();

    // Spawn Claude Code to call MCP
    const proc = spawn('claude', [
        '--print',
        '--permission-mode', 'bypassPermissions',
        command
    ], {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: process.cwd(),
        env: {
            ...process.env,
            PYTHONUNBUFFERED: '1'
        }
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
        stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
        stderr += data.toString();
    });

    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            proc.kill();
            reject(new Error('Timeout spawning helper agent'));
        }, 30000); // 30 second timeout for spawning

        proc.on('close', (code) => {
            clearTimeout(timeoutId);

            if (code === 0) {
                // Extract task_id from output (look for UUID format)
                const taskIdMatch = stdout.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
                if (taskIdMatch) {
                    const taskId = taskIdMatch[1];

                    // Store agent info
                    activeAgents.set(agentId, {
                        taskId: taskId,
                        name: agentId,
                        task: task,
                        spawnTime: new Date(),
                        status: 'running'
                    });

                    resolve(`✅ Helper agent "${agentId}" summoned!\nTask ID: ${taskId}\nWorking on: ${task.slice(0, 100)}...`);
                } else {
                    reject(new Error('Could not extract task ID from response'));
                }
            } else {
                reject(new Error(`Failed to summon agent: ${stderr}`));
            }
        });

        proc.on('error', (err) => {
            clearTimeout(timeoutId);
            reject(err);
        });
    });
}

/**
 * Check on a helper agent's progress
 *
 * @param {string} agentIdOrName - The agent ID or name
 * @returns {string} - Status report
 */
async function checkAgent(agent, agentIdOrName) {
    const agentInfo = activeAgents.get(agentIdOrName);

    if (!agentInfo) {
        return `❌ No helper agent found with ID: ${agentIdOrName}\nActive agents: ${Array.from(activeAgents.keys()).join(', ') || 'none'}`;
    }

    // Use context-foundry MCP to check status
    const command = `
Please use the context-foundry MCP tool 'get_delegation_result' to check on this task:

Task ID: ${agentInfo.taskId}

Return the current status and any progress information.
    `.trim();

    const proc = spawn('claude', [
        '--print',
        '--permission-mode', 'bypassPermissions',
        command
    ], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
            ...process.env,
            PYTHONUNBUFFERED: '1'
        }
    });

    let stdout = '';

    proc.stdout.on('data', (data) => {
        stdout += data.toString();
    });

    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            proc.kill();
            reject(new Error('Timeout checking agent status'));
        }, 20000);

        proc.on('close', (code) => {
            clearTimeout(timeoutId);

            if (code === 0) {
                // Update agent status
                if (stdout.includes('"status": "completed"') || stdout.includes('"status": "failed"')) {
                    const status = stdout.includes('"status": "completed"') ? 'completed' : 'failed';
                    agentInfo.status = status;

                    // Create context file
                    const contextFile = `.context-foundry/agent-${agentInfo.name}-context.txt`;
                    resolve(`✅ Helper "${agentInfo.name}" has ${status}!\n\nResults saved to: ${contextFile}\n\nRaw status:\n${stdout.slice(0, 500)}`);
                } else {
                    resolve(`⏳ Helper "${agentInfo.name}" is still working...\n\n${stdout.slice(0, 500)}`);
                }
            } else {
                reject(new Error('Failed to check agent status'));
            }
        });

        proc.on('error', (err) => {
            clearTimeout(timeoutId);
            reject(err);
        });
    });
}

/**
 * List all active helper agents
 */
function listAgents(agent) {
    if (activeAgents.size === 0) {
        return "No active helper agents.";
    }

    let result = `Active helper agents (${activeAgents.size}):\n`;
    for (const [agentId, info] of activeAgents.entries()) {
        const elapsed = Math.floor((Date.now() - info.spawnTime.getTime()) / 1000);
        result += `\n- ${agentId}: ${info.status} (${elapsed}s ago)\n  Task: ${info.task.slice(0, 80)}...\n`;
    }

    return result;
}

/**
 * Start a build using context-foundry autonomous build
 *
 * @param {string} projectName - Name for the project
 * @param {string} description - What to build
 * @returns {string} - Build status
 */
async function startBuild(agent, projectName, description) {
    const command = `
Please use the context-foundry MCP tool 'autonomous_build_and_deploy' to start building:

Project Name: ${projectName}
Task Description: ${description}
Timeout: 60 minutes

Return the task ID so I can check on the build later.
    `.trim();

    const proc = spawn('claude', [
        '--print',
        '--permission-mode', 'bypassPermissions',
        command
    ], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
            ...process.env,
            PYTHONUNBUFFERED: '1'
        }
    });

    let stdout = '';

    proc.stdout.on('data', (data) => {
        stdout += data.toString();
    });

    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            proc.kill();
            reject(new Error('Timeout starting build'));
        }, 30000);

        proc.on('close', (code) => {
            clearTimeout(timeoutId);

            if (code === 0) {
                resolve(`✅ Build started!\n\n${stdout.slice(0, 500)}`);
            } else {
                reject(new Error('Failed to start build'));
            }
        });

        proc.on('error', (err) => {
            clearTimeout(timeoutId);
            reject(err);
        });
    });
}

// Export commands in mindcraft format
export const mcpCommandList = [
    {
        name: '!summonAgent',
        description: 'Summon a helper agent to work on a task in the background. The helper will work autonomously and save its results to a context file when done.',
        params: {
            task: { type: 'string', description: 'Description of what the helper should do' }
        },
        perform: async function(agent, task, name = null) {
            return await summonAgent(agent, task, name);
        }
    },
    {
        name: '!checkAgent',
        description: 'Check on the progress of a helper agent.',
        params: {
            agentId: { type: 'string', description: 'The agent ID or name to check' }
        },
        perform: async function(agent, agentId) {
            return await checkAgent(agent, agentId);
        }
    },
    {
        name: '!listAgents',
        description: 'List all active helper agents.',
        perform: function(agent) {
            return listAgents(agent);
        }
    },
    {
        name: '!startBuild',
        description: 'Start an autonomous build using context-foundry. The build will run through Scout→Architect→Builder→Test→Deploy phases automatically.',
        params: {
            projectName: { type: 'string', description: 'Name for the project' },
            description: { type: 'string', description: 'What to build' }
        },
        perform: async function(agent, projectName, description) {
            return await startBuild(agent, projectName, description);
        }
    },
    // === NEW MINECRAFT BOT ORCHESTRATION COMMANDS ===
    {
        name: '!orchestrateTask',
        description: 'Orchestrate a complex Minecraft task using Scout→Architect→Builder→Tester bot pattern. Spawns multiple Minecraft bots that coordinate to complete the task.',
        params: {
            taskName: { type: 'string', description: 'Name of the task (e.g., "Build house")' },
            taskDescription: { type: 'string', description: 'Detailed description of what to do' }
        },
        perform: async function(agent, taskName, taskDescription, parallel = true, search_radius = 64) {
            // Check if orchestration is enabled
            if (!settings.enable_orchestration) {
                return "❌ Bot orchestration is disabled. Set enable_orchestration: true in settings.js to spawn helper bots.";
            }

            try {
                const orchestrator = getOrchestrator();
                orchestrator.parentAgent = agent;  // Pass andy for coordination
                return await orchestrator.orchestrateTask(taskName, taskDescription, parallel, search_radius);
            } catch (error) {
                console.error('[MCP] Orchestration error:', error);
                // Return gracefully instead of crashing
                return `❌ Orchestration failed: ${error.message}. The helper bots couldn't be spawned. I'll try building it myself instead with !newAction.`;
            }
        }
    },
    {
        name: '!spawnBot',
        description: 'Spawn a single Minecraft bot with a specific role and task. The bot will appear as a player in-game.',
        params: {
            botName: { type: 'string', description: 'Name for the bot (e.g., "miner-1")' },
            role: { type: 'string', description: 'Bot role: Scout, Architect, Builder, Tester, or custom' },
            task: { type: 'string', description: 'What the bot should do' }
        },
        perform: async function(agent, botName, role, task) {
            // Check if orchestration is enabled
            if (!settings.enable_orchestration) {
                return "❌ Bot orchestration is disabled. Set enable_orchestration: true in settings.js to spawn helper bots.";
            }

            try {
                const orchestrator = getOrchestrator();
                orchestrator.parentAgent = agent;  // Pass andy for auto-OP
                await orchestrator.init();

                await orchestrator._spawnBot({
                    id: `bot-${Date.now()}`,
                    botName: botName,
                    role: role,
                    task: task,
                    dependencies: []
                });

                return `✅ Bot "${botName}" spawned as ${role}!\nTask: ${task}\nThe bot should appear in-game shortly.`;
            } catch (error) {
                return `❌ Spawn error: ${error.message}`;
            }
        }
    },
    {
        name: '!botStatus',
        description: 'Check the status of spawned Minecraft bots. Call without arguments to list all bots, or provide a bot ID to check a specific bot.',
        params: {},
        perform: function(agent, botId = null) {
            const orchestrator = getOrchestrator();

            if (!botId) {
                // List all bots
                const bots = orchestrator.listActiveBots();
                if (bots.length === 0) {
                    return 'No active bots.';
                }

                let output = `Active bots: ${bots.length}\n\n`;
                for (const bot of bots) {
                    const elapsed = Math.round(bot.elapsed / 1000);
                    const status = bot.completed ? '✅ Complete' : '⏳ Working';
                    output += `${status} ${bot.botName} (${bot.role}): ${elapsed}s\n`;
                    output += `  Task: ${bot.task.slice(0, 80)}...\n\n`;
                }
                return output;
            }

            // Check specific bot
            const status = orchestrator.getBotStatus(botId);
            if (!status) {
                return `❌ Bot "${botId}" not found`;
            }

            const elapsed = Math.round(status.elapsed / 1000);
            const statusText = status.completed ? '✅ Complete' : '⏳ Working';

            return `${statusText} ${status.botName} (${status.role})\n` +
                   `Task: ${status.task}\n` +
                   `Elapsed: ${elapsed}s\n` +
                   `Agent: ${status.agentName}`;
        }
    },
    {
        name: '!listBots',
        description: 'List all active spawned Minecraft bots.',
        perform: function(agent) {
            const orchestrator = getOrchestrator();
            const bots = orchestrator.listActiveBots();

            if (bots.length === 0) {
                return 'No active bots. Use !spawnBot or !orchestrateTask to spawn bots.';
            }

            let output = `Active Minecraft bots: ${bots.length}\n\n`;
            for (const bot of bots) {
                const elapsed = Math.round(bot.elapsed / 1000);
                const status = bot.completed ? '✅' : '⏳';
                output += `${status} ${bot.botName} (${bot.role}) - ${elapsed}s\n`;
            }

            output += `\nUse !botStatus("bot-id") for details.`;
            return output;
        }
    },
    // === SURVIVAL MILESTONE ORCHESTRATION ===
    {
        name: '!surviveMilestone',
        description: 'Execute a survival milestone by spawning Gatherer and Crafter bots. Milestones: survive_first_night, wooden_tools, stone_tools, iron_tools, diamond_pickaxe',
        params: {
            milestoneName: { type: 'string', description: 'Name of milestone: survive_first_night, wooden_tools, stone_tools, iron_tools, diamond_pickaxe' }
        },
        perform: async function(agent, milestoneName) {
            // Check if orchestration is enabled
            if (!settings.enable_orchestration) {
                return "❌ Bot orchestration is disabled. Set enable_orchestration: true in settings.js to spawn helper bots.";
            }

            try {
                const orchestrator = getSurvivalOrchestrator(agent);
                const result = await orchestrator.executeMilestone(milestoneName);

                if (result.success) {
                    let output = `${result.message}\n\n`;
                    output += `Duration: ${Math.round(result.duration / 1000)}s\n`;
                    output += `Tasks completed: ${result.tasks.length}\n`;

                    if (result.nextMilestone) {
                        output += `\nNext milestone: ${result.nextMilestone}`;
                    }

                    return output;
                } else {
                    return `❌ ${result.message}`;
                }
            } catch (error) {
                console.error('[MCP] Survival orchestration error:', error);
                return `❌ Survival orchestration failed: ${error.message}`;
            }
        }
    },
    {
        name: '!survivalProgress',
        description: 'Check overall survival progress and current milestone.',
        perform: function(agent) {
            try {
                const orchestrator = getSurvivalOrchestrator(agent);
                const progress = orchestrator.getProgress();

                let output = `🎯 Survival Progress: ${progress.completion_percentage}%\n\n`;
                output += `✅ Completed (${progress.completed_milestones.length}):\n`;
                for (const milestone of progress.completed_milestones) {
                    output += `  - ${milestone}\n`;
                }

                if (progress.current_milestone) {
                    output += `\n⏳ Current: ${progress.current_milestone}\n`;
                }

                if (progress.next_milestone) {
                    output += `📋 Next: ${progress.next_milestone}\n`;
                }

                output += `\n⏱️  Playtime: ${Math.round(progress.total_playtime / 60)}m`;
                output += `\n💀 Deaths: ${progress.total_deaths}`;

                return output;
            } catch (error) {
                return `❌ Could not get progress: ${error.message}`;
            }
        }
    },
    {
        name: '!currentMilestone',
        description: 'Get the current milestone and strategy.',
        perform: function(agent) {
            try {
                const orchestrator = getSurvivalOrchestrator(agent);
                const milestone = orchestrator.getCurrentMilestone();

                if (milestone.completed) {
                    return '🎉 All milestones complete!';
                }

                let output = `Current milestone: ${milestone.name}\n`;
                output += `Description: ${milestone.description}\n\n`;

                if (milestone.strategy) {
                    output += `Tasks required: ${milestone.strategy.tasks.length}\n`;
                    for (let i = 0; i < milestone.strategy.tasks.length; i++) {
                        const task = milestone.strategy.tasks[i];
                        output += `${i + 1}. ${task.role}: ${task.task}\n`;
                    }
                }

                return output;
            } catch (error) {
                return `❌ Could not get milestone: ${error.message}`;
            }
        }
    },
    {
        name: '!botPoolStatus',
        description: 'Check available bot names in the whitelist pool. Shows how many bot slots are in use vs available for each role.',
        perform: function(agent) {
            try {
                const orchestrator = getOrchestrator();
                if (!orchestrator.namePool) {
                    return '❌ Bot name pool not initialized';
                }

                const status = orchestrator.namePool.getStatus();

                let output = '🤖 Bot Name Pool Status:\n\n';
                const roles = ['Gatherer', 'Crafter', 'Builder', 'Scout', 'Architect', 'Tester'];

                let totalAvailable = 0;
                let totalInUse = 0;
                let totalCapacity = 0;

                for (const role of roles) {
                    const data = status[role];
                    if (data) {
                        const utilization = Math.round((data.allocated / data.total) * 100);
                        const bar = '█'.repeat(Math.floor(utilization / 10)) + '░'.repeat(10 - Math.floor(utilization / 10));

                        output += `${role}: ${data.allocated}/${data.total} in use (${utilization}%)\n`;
                        output += `  ${bar}\n`;

                        totalInUse += data.allocated;
                        totalAvailable += data.available;
                        totalCapacity += data.total;
                    }
                }

                output += `\n📊 Total: ${totalInUse}/${totalCapacity} slots in use`;
                output += `\n✅ Available: ${totalAvailable} slots free`;

                if (totalAvailable < 5) {
                    output += `\n\n⚠️ WARNING: Low bot slots available!`;
                }

                return output;
            } catch (error) {
                return `❌ Could not get pool status: ${error.message}`;
            }
        }
    },
    // === BOT LIFECYCLE MANAGEMENT ===
    {
        name: '!killBot',
        description: 'Kill a spawned Minecraft bot and release its name back to the pool. The bot will disconnect from the game.',
        params: {
            botName: { type: 'string', description: 'Name of the bot to kill (e.g., "gatherer-1", "crafter-2")' }
        },
        perform: function(agent, botName) {
            try {
                const orchestrator = getOrchestrator();

                // Check if bot exists
                if (!orchestrator.activeBotNames.has(botName) && !orchestrator.activeBots.has(botName)) {
                    // Try to find by bot ID instead
                    let foundBotId = null;
                    for (const [botId, name] of orchestrator.activeBotNames.entries()) {
                        if (name === botName) {
                            foundBotId = botId;
                            break;
                        }
                    }

                    if (!foundBotId) {
                        return `❌ Bot "${botName}" not found. Use !listBots to see active bots.`;
                    }
                }

                // Destroy the agent
                console.log(`[MCP] Killing bot: ${botName}`);
                Mindcraft.destroyAgent(botName);

                // Release name back to pool
                if (orchestrator.namePool) {
                    orchestrator.namePool.releaseName(botName);
                }

                // Clean up tracking
                for (const [botId, name] of orchestrator.activeBotNames.entries()) {
                    if (name === botName) {
                        orchestrator.activeBotNames.delete(botId);
                        orchestrator.activeBots.delete(botId);
                        break;
                    }
                }

                return `✅ Bot "${botName}" killed and name released back to pool.`;
            } catch (error) {
                return `❌ Error killing bot: ${error.message}`;
            }
        }
    },
    {
        name: '!killAllBots',
        description: 'Kill all spawned orchestrated bots (gatherer, crafter, builder, scout, architect, tester) and release their names back to the pool.',
        perform: function(agent) {
            try {
                const orchestrator = getOrchestrator();

                if (orchestrator.activeBotNames.size === 0) {
                    return '❌ No active bots to kill.';
                }

                const killedBots = [];
                const botNames = Array.from(orchestrator.activeBotNames.values());

                for (const botName of botNames) {
                    try {
                        console.log(`[MCP] Killing bot: ${botName}`);
                        Mindcraft.destroyAgent(botName);

                        if (orchestrator.namePool) {
                            orchestrator.namePool.releaseName(botName);
                        }

                        killedBots.push(botName);
                    } catch (err) {
                        console.error(`[MCP] Error killing ${botName}:`, err);
                    }
                }

                // Clear all tracking
                orchestrator.activeBotNames.clear();
                orchestrator.activeBots.clear();

                if (killedBots.length === 0) {
                    return '❌ Failed to kill any bots.';
                }

                return `✅ Killed ${killedBots.length} bot${killedBots.length > 1 ? 's' : ''}:\n${killedBots.join(', ')}\n\nAll names released back to pool.`;
            } catch (error) {
                return `❌ Error killing bots: ${error.message}`;
            }
        }
    },
    {
        name: '!releaseBotName',
        description: 'Release a bot name back to the pool without killing the bot. Useful if a bot died or disconnected but name is still allocated.',
        params: {
            botName: { type: 'string', description: 'Name to release (e.g., "gatherer-1")' }
        },
        perform: function(agent, botName) {
            try {
                const orchestrator = getOrchestrator();

                if (!orchestrator.namePool) {
                    return '❌ Bot name pool not initialized';
                }

                // Check if name is actually allocated
                const allocatedNames = orchestrator.namePool.getAllocatedNames();
                if (!allocatedNames.includes(botName)) {
                    return `❌ Name "${botName}" is not currently allocated.\n\nAllocated names: ${allocatedNames.join(', ') || 'none'}`;
                }

                // Release the name
                orchestrator.namePool.releaseName(botName);

                // Clean up tracking
                for (const [botId, name] of orchestrator.activeBotNames.entries()) {
                    if (name === botName) {
                        orchestrator.activeBotNames.delete(botId);
                        orchestrator.activeBots.delete(botId);
                        break;
                    }
                }

                return `✅ Name "${botName}" released back to pool (bot not killed).`;
            } catch (error) {
                return `❌ Error releasing name: ${error.message}`;
            }
        }
    },
    // === RESOURCE MAP SYSTEM ===
    {
        name: '!logResource',
        description: 'Log a resource location to the shared resource map. All bots can see this.',
        params: {
            type: { type: 'string', description: 'Resource type (oak_log, stone, iron_ore, etc.)' },
            x: { type: 'number', description: 'X coordinate' },
            y: { type: 'number', description: 'Y coordinate' },
            z: { type: 'number', description: 'Z coordinate' },
            abundance: { type: 'string', description: 'sparse, moderate, dense, or abundant (optional)' },
            notes: { type: 'string', description: 'Additional notes (optional)' }
        },
        perform: async function(agent, type, x, y, z, abundance = 'unknown', notes = '') {
            try {
                const resourceMap = getGlobalResourceMap();
                await resourceMap.init();

                const logged = await resourceMap.logResource(
                    type,
                    x,
                    y,
                    z,
                    agent.name,
                    abundance,
                    notes
                );

                if (logged) {
                    return `✅ Logged ${type} at (${Math.floor(x)}, ${Math.floor(y)}, ${Math.floor(z)})\nAbundance: ${abundance}\nNotes: ${notes || 'none'}`;
                } else {
                    return `ℹ️ ${type} at (${Math.floor(x)}, ${Math.floor(y)}, ${Math.floor(z)}) already logged (within 10 blocks)`;
                }
            } catch (error) {
                return `❌ Error logging resource: ${error.message}`;
            }
        }
    },
    {
        name: '!findResource',
        description: 'Find nearest resource location from the shared resource map.',
        params: {
            type: { type: 'string', description: 'Resource type to find (oak_log, stone, iron_ore, etc.)' },
            maxDistance: { type: 'number', description: 'Maximum search distance in blocks (optional, default 1000)' }
        },
        perform: async function(agent, type, maxDistance = 1000) {
            try {
                const resourceMap = getGlobalResourceMap();
                await resourceMap.init();

                // Get agent position
                const pos = agent.bot.entity.position;
                const nearest = resourceMap.findNearest(type, pos.x, pos.y, pos.z, maxDistance);

                if (!nearest) {
                    // Check if type exists at all
                    const all = resourceMap.findAll(type);
                    if (all.length === 0) {
                        return `❌ No ${type} locations logged yet.\n\nTip: Send scouts to explore and log resources!`;
                    } else {
                        return `❌ No ${type} found within ${maxDistance} blocks.\n\nClosest known location is ${Math.floor(all[0].distance)} blocks away (too far).`;
                    }
                }

                const distance = Math.floor(nearest.distance);
                const age = Math.floor((Date.now() - new Date(nearest.timestamp).getTime()) / 1000 / 60);

                return `📍 Nearest ${type}:\n` +
                       `Location: (${nearest.x}, ${nearest.y}, ${nearest.z})\n` +
                       `Distance: ${distance} blocks away\n` +
                       `Abundance: ${nearest.abundance}\n` +
                       `Discovered by: ${nearest.discoveredBy}\n` +
                       `${age < 60 ? age + ' minutes ago' : Math.floor(age / 60) + ' hours ago'}\n` +
                       `${nearest.notes ? 'Notes: ' + nearest.notes : ''}`;
            } catch (error) {
                return `❌ Error finding resource: ${error.message}`;
            }
        }
    },
    {
        name: '!checkResourceMap',
        description: 'View summary of all logged resources in the shared resource map.',
        perform: async function(agent) {
            try {
                const resourceMap = getGlobalResourceMap();
                await resourceMap.init();

                const summary = resourceMap.getSummary();

                if (summary.totalResources === 0) {
                    return `📭 Resource map is empty.\n\nNo resources logged yet. Send scouts to explore!`;
                }

                let output = `📋 Resource Map Summary:\n\n`;
                output += `Total: ${summary.totalResources} locations logged\n`;
                output += `Types: ${summary.totalTypes} different resources\n\n`;

                const types = Object.keys(summary.byType).sort();
                for (const type of types) {
                    const data = summary.byType[type];
                    output += `📦 ${type}: ${data.count} location${data.count > 1 ? 's' : ''}\n`;

                    // Show first 2 locations for each type
                    const showing = Math.min(2, data.locations.length);
                    for (let i = 0; i < showing; i++) {
                        const loc = data.locations[i];
                        output += `  └─ ${loc.coords} (${loc.abundance}) - found by ${loc.discoveredBy}\n`;
                    }

                    if (data.locations.length > 2) {
                        output += `  └─ ...and ${data.locations.length - 2} more\n`;
                    }

                    output += '\n';
                }

                output += `💡 Use !findResource("type") to get nearest location`;

                return output;
            } catch (error) {
                return `❌ Error reading resource map: ${error.message}`;
            }
        }
    },
    {
        name: '!cleanResourceMap',
        description: 'Remove old resource locations from the map (older than X days). Keeps map fresh.',
        params: {
            days: { type: 'number', description: 'Remove resources older than this many days (default: 7)' }
        },
        perform: async function(agent, days = 7) {
            try {
                const resourceMap = getGlobalResourceMap();
                await resourceMap.init();

                const removed = await resourceMap.cleanOldResources(days);

                if (removed === 0) {
                    return `✅ Resource map is clean - no entries older than ${days} days.`;
                } else {
                    return `✅ Cleaned resource map - removed ${removed} old resource${removed > 1 ? 's' : ''} (>${days} days old)`;
                }
            } catch (error) {
                return `❌ Error cleaning resource map: ${error.message}`;
            }
        }
    }
];
