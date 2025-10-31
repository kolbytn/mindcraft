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
    }
];
