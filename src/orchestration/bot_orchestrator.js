/**
 * Minecraft Bot Orchestrator
 *
 * Inspired by context-foundry's parallel agent orchestration pattern.
 * Spawns multiple Minecraft bots to work on coordinated tasks.
 *
 * Pattern: Scout → Architect → Builder → Tester
 * Coordination: File-based (.done markers) + In-game chat
 */

import { writeFile, mkdir, readFile, existsSync } from 'fs';
import { createWriteStream } from 'fs';
import path from 'path';
import { promisify } from 'util';
import * as Mindcraft from '../mindcraft/mindcraft.js';
import settings from '../../settings.js';
import { serverProxy } from '../agent/mindserver_proxy.js';
import { Priority, determineTaskPriority, getPrerequisiteTasks, sortByPriority } from './priorities.js';
import { BotNamePool } from './bot_name_pool.js';

// Note: Orchestrator uses socket.io API to create agents in the main MindServer
// This ensures all agents are registered in the same process

const writeFileAsync = promisify(writeFile);
const readFileAsync = promisify(readFile);
const mkdirAsync = promisify(mkdir);

export class BotOrchestrator {
    constructor(baseDir = process.cwd()) {
        this.baseDir = baseDir;
        this.agentsDir = path.join(baseDir, '.mindcraft-agents');
        this.profilesDir = path.join(this.agentsDir, 'profiles');
        this.logsDir = path.join(this.agentsDir, 'logs');
        this.contextDir = path.join(this.agentsDir, 'context');
        this.activeBots = new Map();
        this.botCounter = 0;

        // Initialize bot name pool (for whitelist management)
        const poolConfig = settings.bot_name_pool || null;
        this.namePool = new BotNamePool(poolConfig);
        this.activeBotNames = new Map(); // Maps bot ID -> allocated name
    }

    /**
     * Initialize orchestrator directories
     */
    async init() {
        await mkdirAsync(this.agentsDir, { recursive: true });
        await mkdirAsync(this.profilesDir, { recursive: true });
        await mkdirAsync(this.logsDir, { recursive: true });
        await mkdirAsync(this.contextDir, { recursive: true });

        // Create empty chat history
        const chatPath = path.join(this.agentsDir, 'chat-history.json');
        if (!existsSync(chatPath)) {
            await writeFileAsync(chatPath, JSON.stringify([], null, 2));
        }
    }

    /**
     * Orchestrate a complete task using Scout → Architect → Builder → Tester pattern
     *
     * @param {string} taskName - Name of the overall task
     * @param {string} taskDescription - Detailed description
     * @param {boolean} parallel - Allow parallel execution (andy decides)
     * @param {number} search_radius - How far the scout should explore in blocks (default: 64)
     * @returns {string} - Result summary
     */
    async orchestrateTask(taskName, taskDescription, parallel = true, search_radius = 32) {
        console.log(`[Orchestrator] Starting task: ${taskName}`);
        console.log(`[Orchestrator] Parallel mode: ${parallel}`);
        console.log(`[Orchestrator] Scout search radius: ${search_radius} blocks`);

        await this.init();

        const results = {
            taskName,
            startTime: Date.now(),
            phases: []
        };

        try {
            // PHASE 1: Scout (gather information)
            console.log('[Orchestrator] Phase 1: Scout');
            const scoutResult = await this._runPhase('scout', {
                id: 'scout-1',
                botName: 'scout-1',
                role: 'Scout',
                task: `Scout for resources and information needed for: ${taskDescription}\n\nSearch Radius: Explore up to ${search_radius} blocks from your starting position. Move around actively to map the area!`,
                outputFile: 'scout-report.md',
                dependencies: []
            });
            results.phases.push(scoutResult);

            // PHASE 2: Architect (create plan)
            console.log('[Orchestrator] Phase 2: Architect');
            const architectResult = await this._runPhase('architect', {
                id: 'architect-1',
                botName: 'architect-1',
                role: 'Architect',
                task: `Read scout-report.md and create a detailed plan for: ${taskDescription}`,
                inputFile: 'scout-report.md',
                outputFile: 'architecture.md',
                dependencies: ['scout-1']
            });
            results.phases.push(architectResult);

            // PHASE 3: Builder(s) (execute the plan)
            console.log('[Orchestrator] Phase 3: Builder');

            // Read architecture to see if we need multiple builders
            const architecturePath = path.join(this.contextDir, 'architecture.md');
            const architecture = await readFileAsync(architecturePath, 'utf-8');

            // Check for build-tasks.json (parallel task breakdown)
            const buildTasksPath = path.join(this.contextDir, 'build-tasks.json');
            let builderResults;

            if (parallel && existsSync(buildTasksPath)) {
                // Parallel build mode
                const buildTasks = JSON.parse(await readFileAsync(buildTasksPath, 'utf-8'));
                builderResults = await this._runParallelBuilders(buildTasks);
            } else {
                // Single builder mode
                builderResults = [await this._runPhase('builder', {
                    id: 'builder-1',
                    botName: 'builder-1',
                    role: 'Builder',
                    task: `Read architecture.md and execute the build plan for: ${taskDescription}`,
                    inputFile: 'architecture.md',
                    outputFile: 'build-log.md',
                    dependencies: ['architect-1']
                })];
            }
            results.phases.push(...builderResults);

            // PHASE 4: Tester (verify completion)
            console.log('[Orchestrator] Phase 4: Tester');
            const testerResult = await this._runPhase('tester', {
                id: 'tester-1',
                botName: 'tester-1',
                role: 'Tester',
                task: `Verify that the build was completed correctly for: ${taskDescription}`,
                inputFile: 'architecture.md',
                outputFile: 'test-report.md',
                dependencies: builderResults.map(r => r.id)
            });
            results.phases.push(testerResult);

            // Save final results
            results.endTime = Date.now();
            results.duration = results.endTime - results.startTime;
            results.success = testerResult.success;

            const resultsPath = path.join(this.contextDir, 'orchestration-results.json');
            await writeFileAsync(resultsPath, JSON.stringify(results, null, 2));

            console.log(`[Orchestrator] Task complete! Duration: ${results.duration}ms`);

            return this._formatResults(results);

        } catch (error) {
            console.error('[Orchestrator] Error:', error);
            results.error = error.message;
            results.success = false;
            return `❌ Orchestration failed: ${error.message}`;
        }
    }

    /**
     * Run a single phase (spawns one bot)
     */
    async _runPhase(phase, taskConfig) {
        const startTime = Date.now();

        console.log(`[Orchestrator] Spawning ${taskConfig.role}: ${taskConfig.botName}`);

        try {
            // Spawn the bot
            await this._spawnBot(taskConfig);

            // Wait for completion
            await this._waitForBot(taskConfig.id);

            const endTime = Date.now();
            const duration = endTime - startTime;

            console.log(`[Orchestrator] ${taskConfig.role} complete (${duration}ms)`);

            return {
                phase,
                id: taskConfig.id,
                botName: taskConfig.botName,
                role: taskConfig.role,
                startTime,
                endTime,
                duration,
                success: true
            };
        } finally {
            // Release bot name back to pool
            this._releaseBot(taskConfig.id);
        }
    }

    /**
     * Run multiple builders in parallel
     */
    async _runParallelBuilders(buildTasks) {
        console.log(`[Orchestrator] Running ${buildTasks.tasks.length} builders in parallel`);

        // Topological sort by dependency level
        const levels = this._topologicalSort(buildTasks.tasks);
        const results = [];

        for (const [levelNum, levelTasks] of levels.entries()) {
            console.log(`[Orchestrator] Level ${levelNum}: ${levelTasks.length} builders`);

            // Spawn all tasks in this level
            const spawns = levelTasks.map(task => this._spawnBot({
                id: task.id,
                botName: `builder-${task.id}`,
                role: 'Builder',
                task: `${task.description}\nFiles to modify: ${task.files.join(', ')}`,
                inputFile: 'architecture.md',
                dependencies: task.dependencies
            }));

            await Promise.all(spawns);

            // Wait for all in this level to complete
            const waits = levelTasks.map(task => this._waitForBot(task.id));
            await Promise.all(waits);

            // Record results
            for (const task of levelTasks) {
                results.push({
                    phase: 'builder',
                    id: task.id,
                    botName: `builder-${task.id}`,
                    role: 'Builder',
                    level: levelNum,
                    success: true
                });
            }
        }

        return results;
    }

    /**
     * Spawn multiple bots in parallel and wait for ALL to complete
     *
     * This is the core of parallel orchestration - allows 2-6 bots
     * to work simultaneously on different tasks.
     *
     * @param {Array} teamConfigs - Array of bot configurations
     * @returns {Promise<Array>} Results from all bots
     *
     * Example:
     * await _spawnParallelTeam([
     *   {role: 'Gatherer', botName: 'gatherer-wood-1', task: 'Gather 64 oak_log at (150,64,-30)'},
     *   {role: 'Gatherer', botName: 'gatherer-stone-1', task: 'Gather 32 cobblestone at (95,70,-10)'},
     *   {role: 'Crafter', botName: 'crafter-1', task: 'Craft wooden_pickaxe and stone_pickaxe'}
     * ]);
     */
    async _spawnParallelTeam(teamConfigs) {
        console.log(`[Orchestrator] Spawning parallel team: ${teamConfigs.length} bots`);

        const startTime = Date.now();

        // Spawn all bots in parallel
        const spawnPromises = teamConfigs.map(config => {
            return this._spawnBot({
                id: config.id || `${config.role.toLowerCase()}-${this.botCounter++}`,
                botName: config.botName,
                role: config.role,
                task: config.task,
                outputFile: config.outputFile || `${config.botName}-output.md`,
                dependencies: config.dependencies || []
            });
        });

        await Promise.all(spawnPromises);
        console.log(`[Orchestrator] All ${teamConfigs.length} bots spawned`);

        // Wait for all bots to complete in parallel
        const waitPromises = teamConfigs.map(config => {
            const botId = config.id || `${config.role.toLowerCase()}-${this.botCounter - teamConfigs.length + teamConfigs.indexOf(config)}`;
            return this._waitForBot(botId);
        });

        await Promise.all(waitPromises);

        const endTime = Date.now();
        const duration = endTime - startTime;

        console.log(`[Orchestrator] Parallel team complete (${duration}ms)`);

        // Return results for each bot
        return teamConfigs.map((config, index) => ({
            phase: 'parallel-team',
            id: config.id || `${config.role.toLowerCase()}-${index + 1}`,
            botName: config.botName,
            role: config.role,
            startTime,
            endTime,
            duration,
            success: true
        }));
    }

    /**
     * Get mode configuration based on bot role
     */
    _getRoleModes(role) {
        const baseModes = {
            self_preservation: true,  // Re-enabled for survival mode (narrate_behavior disabled to prevent spam)
            unstuck: true,
            cowardice: false,
            self_defense: true,       // Re-enabled for survival mode
            elbow_room: false,        // Keep disabled to prevent movement spam
            idle_staring: false
        };

        switch (role) {
            case 'Scout':
                // Scout: Fast exploration ONLY (no collecting)
                // CRITICAL: Disable self_preservation to prevent water death loops
                return {
                    ...baseModes,
                    self_preservation: false,  // DISABLED - scouts get stuck in water loops
                    self_defense: false,       // DISABLED - focus on scouting, not fighting
                    hunting: false,            // No hunting - just scout
                    item_collecting: false,    // NO COLLECTING - just exploring!
                    torch_placing: false,
                    cheat: false
                };

            case 'Gatherer':
                // Gatherer: Resource collection specialist
                return {
                    ...baseModes,
                    hunting: true,          // Hunt if gathering food
                    item_collecting: true,  // Main job: collect resources!
                    torch_placing: false,
                    cheat: false           // NO CHEATS - gather legitimately
                };

            case 'Crafter':
                // Crafter: Crafting specialist (doesn't move much)
                return {
                    ...baseModes,
                    hunting: false,
                    item_collecting: false, // Doesn't gather, only crafts
                    torch_placing: false,
                    cheat: false
                };

            case 'Architect':
                // Architect: Plans and designs, doesn't build
                return {
                    ...baseModes,
                    hunting: false,
                    item_collecting: false,  // Don't collect, just plan
                    torch_placing: false,
                    cheat: false            // NO CHEATS - just planning
                };

            case 'Builder':
                // Builder: Builds using gathered resources
                return {
                    ...baseModes,
                    hunting: false,
                    item_collecting: false,  // Uses resources from Scout
                    torch_placing: true,     // Light up builds
                    cheat: false            // NO CHEATS - build block by block!
                };

            case 'Tester':
                // Tester: Inspects and verifies builds
                return {
                    ...baseModes,
                    hunting: false,
                    item_collecting: false,  // Just inspecting
                    torch_placing: false,
                    cheat: false            // NO CHEATS - just testing
                };

            default:
                // Default: Conservative settings
                return {
                    ...baseModes,
                    hunting: false,
                    item_collecting: false,
                    torch_placing: false,
                    cheat: false
                };
        }
    }

    /**
     * Spawn a single bot using MCP context-foundry pattern (recursive Claude spawning)
     */
    async _spawnBot(taskConfig) {
        this.botCounter++;

        // Allocate bot name from pool (for whitelist compatibility)
        const pooledName = this.namePool.allocateName(taskConfig.role);
        if (!pooledName) {
            throw new Error(`[Orchestrator] No available bot names for role ${taskConfig.role}. Pool exhausted! Check !botPoolStatus`);
        }

        // Store original task ID -> pooled name mapping
        this.activeBotNames.set(taskConfig.id, pooledName);

        // Use pooled name instead of dynamic name
        const originalBotName = taskConfig.botName;
        taskConfig.botName = pooledName;

        console.log(`[Orchestrator] Allocated bot name: ${pooledName} (requested: ${originalBotName})`);

        // Load role-specific prompt (try simple version first, fallback to full version)
        const simplePromptPath = path.join(this.baseDir, 'src', 'orchestration', 'prompts', `${taskConfig.role.toLowerCase()}_prompt_simple.txt`);
        const fullPromptPath = path.join(this.baseDir, 'src', 'orchestration', 'prompts', `${taskConfig.role.toLowerCase()}_prompt.txt`);

        let rolePrompt = '';
        if (existsSync(simplePromptPath)) {
            rolePrompt = await readFileAsync(simplePromptPath, 'utf-8');
            console.log(`[Orchestrator] Using simplified prompt for ${taskConfig.role}`);
        } else if (existsSync(fullPromptPath)) {
            rolePrompt = await readFileAsync(fullPromptPath, 'utf-8');
            console.log(`[Orchestrator] Using full prompt for ${taskConfig.role}`);
        }

        // Create bot profile with task instructions
        const profile = {
            name: taskConfig.botName,
            model: settings.profile?.model || "claudecode/claude-sonnet-4-5-20250929",
            modes: this._getRoleModes(taskConfig.role),
            // Add custom prompt with role and task
            // CRITICAL: !goal instruction FIRST so the bot sees it immediately
            conversation_examples: [
                [
                    {"role": "system", "content": `IMPORTANT: Your FIRST response MUST be this exact command to start autonomous operation:
!goal Complete the ${taskConfig.role} task

You are ${taskConfig.botName}, a ${taskConfig.role} bot in a coordinated Minecraft building project.

Your specific task: ${taskConfig.task}

${rolePrompt}

REMINDER: Start with !goal command, then work autonomously until complete.`}
                ]
            ]
        };

        const profilePath = path.join(this.profilesDir, `${taskConfig.botName}.json`);
        await writeFileAsync(profilePath, JSON.stringify(profile, null, 2));

        console.log(`[Orchestrator] Creating bot via MindServer API for ${taskConfig.botName} (${taskConfig.role})`);

        // Clone the full settings object (matches main.js pattern)
        // This ensures the agent has all required config fields
        const agentSettings = { ...settings };
        agentSettings.profile = profile;
        agentSettings.load_memory = false;
        agentSettings.init_message = `I am ${taskConfig.botName}, ready to help with the ${taskConfig.role} phase.`;
        agentSettings.narrate_behavior = false; // Disable narration to prevent spam kicks

        console.log(`[Orchestrator] Sending create-agent request to MindServer for ${taskConfig.botName}`);

        // Use socket.io API to create agent in the MAIN MindServer
        // This ensures registration happens in the correct process (main, not child)
        const socket = serverProxy.getSocket();
        if (!socket) {
            throw new Error('Not connected to MindServer - cannot create agent');
        }

        // Send create-agent event and wait for response
        const createResult = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Timeout creating agent ${taskConfig.botName} after 30 seconds`));
            }, 30000);

            socket.emit('create-agent', agentSettings, (response) => {
                clearTimeout(timeout);
                resolve(response);
            });
        });

        if (!createResult.success) {
            throw new Error(`Failed to create ${taskConfig.botName}: ${createResult.error}`);
        }

        console.log(`[Orchestrator] Agent created successfully via API, waiting for spawn...`);

        // Wait for agent to spawn and appear in agents list
        // We'll poll the agents list via serverProxy
        const maxWaitMs = 60000; // 60 seconds
        const startTime = Date.now();
        let agentConnected = false;

        while (!agentConnected && (Date.now() - startTime < maxWaitMs)) {
            const agents = serverProxy.getAgents();
            const agent = agents.find(a => a.name === taskConfig.botName);

            if (agent && agent.in_game) {
                agentConnected = true;
                console.log(`[Orchestrator] ✅ ${taskConfig.botName} spawned and connected to Minecraft`);
                break;
            }

            // Wait a bit before checking again
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        if (!agentConnected) {
            throw new Error(`Agent ${taskConfig.botName} did not connect within ${maxWaitMs}ms`);
        }

        // Track bot
        this.activeBots.set(taskConfig.id, {
            taskConfig,
            spawnTime: Date.now(),
            botName: taskConfig.botName,
            role: taskConfig.role,
            createdViaAPI: true
        });

        // The bot will auto-start self-prompting via its initial system message
        // which instructs it to use !goal command in its first response
        console.log(`[Orchestrator] ${taskConfig.botName} will auto-start self-prompting via !goal command`);

        // Wait a moment for agent to fully initialize
        await new Promise(resolve => setTimeout(resolve, 2000));

        return taskConfig.id;
    }

    /**
     * Wait for a bot to complete (polls for .done file)
     */
    async _waitForBot(botId, maxWaitMs = 600000) {
        const checkInterval = 1000; // 1 second
        const startTime = Date.now();
        const donePath = path.join(this.logsDir, `${botId}.done`);

        // Also check for .done file by bot name (since bot only knows its pooled name)
        const botName = this.activeBotNames.get(botId);
        const botNameDonePath = botName ? path.join(this.logsDir, `${botName}.done`) : null;

        while (true) {
            // Check for .done file by task ID
            if (existsSync(donePath)) {
                console.log(`[Orchestrator] Bot ${botId} completed (found ${botId}.done)`);
                return true;
            }

            // Also check for .done file by bot name
            if (botNameDonePath && existsSync(botNameDonePath)) {
                console.log(`[Orchestrator] Bot ${botId} completed (found ${botName}.done)`);
                return true;
            }

            // Check timeout
            if (Date.now() - startTime > maxWaitMs) {
                throw new Error(`Timeout waiting for bot ${botId}`);
            }

            // Wait before next check
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }
    }

    /**
     * Release bot name back to pool
     *
     * @param {string} botId - Bot task ID
     */
    _releaseBot(botId) {
        const botName = this.activeBotNames.get(botId);
        if (botName) {
            this.namePool.releaseName(botName);
            this.activeBotNames.delete(botId);
            console.log(`[Orchestrator] Released bot name: ${botName} back to pool`);
        }

        // Clean up from active bots tracker
        this.activeBots.delete(botId);
    }

    /**
     * Topological sort tasks by dependencies
     */
    _topologicalSort(tasks) {
        const levels = new Map();
        const taskMap = new Map(tasks.map(t => [t.id, t]));

        function getLevel(taskId) {
            const task = taskMap.get(taskId);
            if (!task.dependencies || task.dependencies.length === 0) {
                return 0;
            }

            const maxDepLevel = Math.max(
                ...task.dependencies.map(depId => getLevel(depId))
            );
            return maxDepLevel + 1;
        }

        for (const task of tasks) {
            const level = getLevel(task.id);
            if (!levels.has(level)) {
                levels.set(level, []);
            }
            levels.get(level).push(task);
        }

        return levels;
    }

    /**
     * Format orchestration results for display
     */
    _formatResults(results) {
        const duration = Math.round(results.duration / 1000);
        const phaseCount = results.phases.length;
        const botCount = new Set(results.phases.map(p => p.botName)).size;

        let output = `✅ Task "${results.taskName}" complete!\n\n`;
        output += `Duration: ${duration} seconds\n`;
        output += `Phases: ${phaseCount}\n`;
        output += `Bots spawned: ${botCount}\n\n`;
        output += `Phase breakdown:\n`;

        for (const phase of results.phases) {
            const phaseDuration = Math.round(phase.duration / 1000);
            output += `- ${phase.role} (${phase.botName}): ${phaseDuration}s\n`;
        }

        output += `\nResults saved to: .mindcraft-agents/context/orchestration-results.json`;

        return output;
    }

    /**
     * Get status of a specific bot
     */
    getBotStatus(botId) {
        const bot = this.activeBots.get(botId);
        if (!bot) {
            return null;
        }

        const donePath = path.join(this.logsDir, `${botId}.done`);
        const completed = existsSync(donePath);
        const elapsed = Date.now() - bot.spawnTime;

        // Check if agent is connected via serverProxy
        let isConnected = false;
        if (bot.createdViaAPI) {
            const agents = serverProxy.getAgents();
            const agent = agents.find(a => a.name === bot.botName);
            isConnected = agent && agent.in_game;
        }

        return {
            botId,
            botName: bot.botName,
            role: bot.role,
            task: bot.taskConfig.task,
            isConnected,
            elapsed,
            completed
        };
    }

    /**
     * List all active bots
     */
    listActiveBots() {
        const bots = [];
        for (const [botId, bot] of this.activeBots.entries()) {
            bots.push(this.getBotStatus(botId));
        }
        return bots;
    }
}
