/**
 * Survival Orchestrator
 *
 * Integrates MilestoneTracker with BotOrchestrator to complete survival milestones.
 * This is the bridge between high-level survival goals and low-level bot spawning.
 *
 * Pattern:
 * Andy → !surviveMilestone → SurvivalOrchestrator → BotOrchestrator → Gatherer/Crafter bots
 *
 * Example:
 * Andy receives: "survive and get wooden tools"
 * Andy calls: !surviveMilestone wooden_tools
 * SurvivalOrchestrator:
 *   1. Loads wooden_tools strategy from MilestoneTracker
 *   2. Maps ResourceGatherer → Gatherer, SurvivalCrafter → Crafter
 *   3. Spawns Gatherer bot: "Gather 10 oak_log"
 *   4. Waits for Gatherer to complete
 *   5. Spawns Crafter bot: "Craft wooden_pickaxe and wooden_axe"
 *   6. Waits for Crafter to complete
 *   7. Updates MilestoneTracker: wooden_tools complete!
 */

import { BotOrchestrator } from './bot_orchestrator.js';
import { MilestoneTracker } from '../agent/survival/milestone_tracker.js';

export class SurvivalOrchestrator {
    constructor(agent, baseDir = process.cwd()) {
        this.agent = agent;
        this.baseDir = baseDir;
        this.botOrchestrator = new BotOrchestrator(baseDir);
        this.milestoneTracker = new MilestoneTracker(agent, baseDir);
    }

    /**
     * Execute a survival milestone by spawning appropriate bots
     *
     * @param {string} milestoneName - Name of milestone (e.g., "wooden_tools")
     * @returns {Object} Result of milestone execution
     */
    async executeMilestone(milestoneName) {
        console.log(`[SurvivalOrchestrator] Starting milestone: ${milestoneName}`);

        // Get current milestone from tracker
        const currentMilestone = this.milestoneTracker.getCurrentMilestone();

        if (currentMilestone.completed) {
            return {
                success: false,
                message: "All milestones already complete! 🎉"
            };
        }

        // Load strategy for this milestone
        const strategy = this.milestoneTracker.getStrategy(milestoneName);

        if (!strategy) {
            return {
                success: false,
                message: `No strategy found for milestone: ${milestoneName}`
            };
        }

        console.log(`[SurvivalOrchestrator] Strategy loaded: ${strategy.name}`);
        console.log(`[SurvivalOrchestrator] Tasks: ${strategy.tasks.length}`);
        console.log(`[SurvivalOrchestrator] Parallel: ${strategy.parallel}`);

        const results = {
            milestone: milestoneName,
            startTime: Date.now(),
            tasks: []
        };

        try {
            // Initialize orchestrator directories
            await this.botOrchestrator.init();

            // Execute tasks based on parallel flag
            if (strategy.parallel && strategy.tasks.length > 1) {
                // Parallel execution (all tasks at once)
                console.log('[SurvivalOrchestrator] Executing tasks in parallel');
                await this._executeParallel(strategy.tasks, results);
            } else {
                // Sequential execution (one task at a time, respecting dependencies)
                console.log('[SurvivalOrchestrator] Executing tasks sequentially');
                await this._executeSequential(strategy.tasks, results);
            }

            // Verify success criteria
            const success = this._verifyCriteria(strategy);

            if (success) {
                // Mark milestone as complete
                this.milestoneTracker.completeMilestone(milestoneName);

                results.success = true;
                results.message = `✅ ${milestoneName} complete!`;

                // Get next milestone
                const nextMilestone = this.milestoneTracker.getNextMilestone();
                if (nextMilestone && !nextMilestone.completed) {
                    results.nextMilestone = nextMilestone.name;
                    results.message += ` Next: ${nextMilestone.name}`;
                } else {
                    results.message += ` All milestones complete! 🎉`;
                }
            } else {
                results.success = false;
                results.message = `❌ ${milestoneName} failed: Success criteria not met`;
            }

            results.endTime = Date.now();
            results.duration = results.endTime - results.startTime;

            console.log(`[SurvivalOrchestrator] ${results.message}`);
            return results;

        } catch (error) {
            console.error(`[SurvivalOrchestrator] Error executing milestone:`, error);
            return {
                success: false,
                message: `Error: ${error.message}`,
                error: error.stack
            };
        }
    }

    /**
     * Execute tasks sequentially (one after another)
     */
    async _executeSequential(tasks, results) {
        for (const task of tasks) {
            console.log(`[SurvivalOrchestrator] Starting task: ${task.id}`);

            // Map strategy role to orchestrator role
            const orchestratorRole = this._mapRole(task.role);

            // Spawn bot using BotOrchestrator
            const taskResult = await this.botOrchestrator._runPhase(task.id, {
                id: task.id,
                botName: `${task.id}-1`,
                role: orchestratorRole,
                task: task.task,
                outputFile: task.output_file || `${task.id}.md`,
                dependencies: task.dependencies || []
            });

            results.tasks.push(taskResult);
            console.log(`[SurvivalOrchestrator] Task complete: ${task.id} (${taskResult.duration}ms)`);
        }
    }

    /**
     * Execute tasks in parallel (all at once)
     */
    async _executeParallel(tasks, results) {
        const teamConfigs = tasks.map(task => ({
            id: task.id,
            botName: `${task.id}-1`,
            role: this._mapRole(task.role),
            task: task.task,
            outputFile: task.output_file || `${task.id}.md`,
            dependencies: task.dependencies || []
        }));

        const teamResults = await this.botOrchestrator._spawnParallelTeam(teamConfigs);
        results.tasks.push(...teamResults);
    }

    /**
     * Map strategy role names to BotOrchestrator role names
     *
     * Strategy uses: ResourceGatherer, SurvivalCrafter, ShelterBuilder
     * BotOrchestrator uses: Gatherer, Crafter, Builder
     */
    _mapRole(strategyRole) {
        const roleMap = {
            'ResourceGatherer': 'Gatherer',
            'SurvivalCrafter': 'Crafter',
            'ShelterBuilder': 'Builder',
            'RecoveryAgent': 'Gatherer' // Use Gatherer for item recovery
        };

        return roleMap[strategyRole] || strategyRole;
    }

    /**
     * Verify that success criteria are met
     *
     * Success criteria format: "inventory.wooden_pickaxe >= 1 AND inventory.wooden_axe >= 1"
     * For MVP, we'll do simple inventory checks
     */
    _verifyCriteria(strategy) {
        if (!strategy.success_criteria) {
            console.log('[SurvivalOrchestrator] No success criteria defined, assuming success');
            return true;
        }

        // Get current inventory
        const inventory = this.milestoneTracker.getInventorySummary();
        console.log('[SurvivalOrchestrator] Verifying success criteria:', strategy.success_criteria);
        console.log('[SurvivalOrchestrator] Current inventory:', inventory);

        // Parse success criteria (simple version for MVP)
        // Example: "inventory.wooden_pickaxe >= 1 AND inventory.wooden_axe >= 1"
        const criteria = strategy.success_criteria.toLowerCase();

        // Extract required items (simple regex parsing)
        const itemRegex = /inventory\.(\w+)\s*>=\s*(\d+)/g;
        let match;
        let allMet = true;

        while ((match = itemRegex.exec(criteria)) !== null) {
            const itemName = match[1];
            const requiredCount = parseInt(match[2]);
            const actualCount = inventory[itemName] || 0;

            console.log(`[SurvivalOrchestrator] Checking: ${itemName} >= ${requiredCount} (have ${actualCount})`);

            if (actualCount < requiredCount) {
                console.log(`[SurvivalOrchestrator] ❌ Missing: ${itemName} (need ${requiredCount}, have ${actualCount})`);
                allMet = false;
            } else {
                console.log(`[SurvivalOrchestrator] ✅ Have: ${itemName} (${actualCount})`);
            }
        }

        return allMet;
    }

    /**
     * Get current milestone and strategy
     */
    getCurrentMilestone() {
        return this.milestoneTracker.getCurrentMilestone();
    }

    /**
     * Get overall progress
     */
    getProgress() {
        return this.milestoneTracker.getProgress();
    }
}
