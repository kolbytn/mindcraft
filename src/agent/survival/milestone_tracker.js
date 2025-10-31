/**
 * Milestone Tracker for Survival Progression
 *
 * Tracks completion of survival milestones (wooden_tools → stone_tools → iron_tools → diamond_pickaxe)
 * Persists progress to .minecraft-context/survival-progress.json
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';

export class MilestoneTracker {
    constructor(agent, baseDir = process.cwd()) {
        this.agent = agent;
        this.baseDir = baseDir;
        this.contextDir = path.join(baseDir, '.minecraft-context');
        this.progressFile = path.join(this.contextDir, 'survival-progress.json');
        this.strategiesFile = path.join(baseDir, 'src', 'agent', 'survival', 'strategies.json');

        // Initialize context directory
        if (!existsSync(this.contextDir)) {
            mkdirSync(this.contextDir, { recursive: true });
        }

        // Load or initialize progress
        this.progress = this.load();

        // Load strategies
        this.strategies = this.loadStrategies();
    }

    /**
     * Load progress from file or initialize new progress
     */
    load() {
        if (existsSync(this.progressFile)) {
            try {
                const data = readFileSync(this.progressFile, 'utf-8');
                return JSON.parse(data);
            } catch (error) {
                console.warn('[MilestoneTracker] Error loading progress, initializing new:', error.message);
                return this.initializeProgress();
            }
        } else {
            return this.initializeProgress();
        }
    }

    /**
     * Initialize new progress structure
     */
    initializeProgress() {
        return {
            started_at: Date.now(),
            last_updated: Date.now(),
            completed_milestones: [],
            current_milestone: null,
            total_deaths: 0,
            total_playtime: 0
        };
    }

    /**
     * Load milestone strategies from JSON
     */
    loadStrategies() {
        if (existsSync(this.strategiesFile)) {
            try {
                const data = readFileSync(this.strategiesFile, 'utf-8');
                return JSON.parse(data);
            } catch (error) {
                console.error('[MilestoneTracker] Error loading strategies:', error.message);
                return {};
            }
        } else {
            console.warn('[MilestoneTracker] Strategies file not found:', this.strategiesFile);
            return {};
        }
    }

    /**
     * Save progress to file
     */
    save() {
        try {
            this.progress.last_updated = Date.now();
            writeFileSync(this.progressFile, JSON.stringify(this.progress, null, 2));
            console.log('[MilestoneTracker] Progress saved');
        } catch (error) {
            console.error('[MilestoneTracker] Error saving progress:', error.message);
        }
    }

    /**
     * Get current milestone based on completed milestones
     * @returns {Object|null} Current milestone or null if all complete
     */
    getCurrentMilestone() {
        const milestoneOrder = [
            'survive_first_night',
            'wooden_tools',
            'stone_tools',
            'iron_tools',
            'diamond_pickaxe'
        ];

        // Find first uncompleted milestone
        for (const milestoneName of milestoneOrder) {
            if (!this.isMilestoneComplete(milestoneName)) {
                const strategy = this.strategies[milestoneName];
                return {
                    name: milestoneName,
                    description: strategy?.description || milestoneName,
                    completed: false,
                    strategy: strategy
                };
            }
        }

        // All milestones complete!
        return {
            name: 'complete',
            description: 'All survival milestones completed! 🎉',
            completed: true
        };
    }

    /**
     * Get next milestone after current
     * @returns {Object|null} Next milestone or null if at end
     */
    getNextMilestone() {
        const current = this.getCurrentMilestone();

        if (current.name === 'complete') {
            return null; // Already at the end
        }

        const milestoneOrder = [
            'survive_first_night',
            'wooden_tools',
            'stone_tools',
            'iron_tools',
            'diamond_pickaxe'
        ];

        const currentIndex = milestoneOrder.indexOf(current.name);

        if (currentIndex === -1 || currentIndex === milestoneOrder.length - 1) {
            return null;
        }

        const nextName = milestoneOrder[currentIndex + 1];
        const strategy = this.strategies[nextName];

        return {
            name: nextName,
            description: strategy?.description || nextName,
            completed: false,
            strategy: strategy
        };
    }

    /**
     * Check if a specific milestone is complete
     * @param {string} milestoneName
     * @returns {boolean}
     */
    isMilestoneComplete(milestoneName) {
        return this.progress.completed_milestones.includes(milestoneName);
    }

    /**
     * Mark a milestone as complete
     * @param {string} milestoneName
     */
    completeMilestone(milestoneName) {
        if (!this.isMilestoneComplete(milestoneName)) {
            this.progress.completed_milestones.push(milestoneName);
            this.progress.current_milestone = null;

            console.log(`[MilestoneTracker] ✅ Milestone complete: ${milestoneName}`);

            // Save checkpoint
            this.saveCheckpoint(milestoneName);

            // Save progress
            this.save();

            // Announce completion
            if (this.agent) {
                const next = this.getNextMilestone();
                const message = next
                    ? `✅ ${milestoneName} complete! Next: ${next.name}`
                    : `🎉 All milestones complete! MVP finished!`;
                this.agent.openChat(message);
            }
        } else {
            console.warn(`[MilestoneTracker] Milestone already complete: ${milestoneName}`);
        }
    }

    /**
     * Set current milestone (when starting work on it)
     * @param {string} milestoneName
     */
    setCurrentMilestone(milestoneName) {
        this.progress.current_milestone = milestoneName;
        this.save();
        console.log(`[MilestoneTracker] Current milestone set to: ${milestoneName}`);
    }

    /**
     * Get overall progress summary
     * @returns {Object}
     */
    getProgress() {
        const current = this.getCurrentMilestone();
        const next = this.getNextMilestone();

        return {
            completed_milestones: this.progress.completed_milestones,
            current_milestone: current.name,
            next_milestone: next?.name || 'none',
            total_milestones: 5,
            completion_percentage: (this.progress.completed_milestones.length / 5) * 100,
            deaths: this.progress.total_deaths,
            playtime: this.progress.total_playtime
        };
    }

    /**
     * Increment death counter
     */
    recordDeath() {
        this.progress.total_deaths++;
        this.save();
        console.log(`[MilestoneTracker] Death recorded. Total: ${this.progress.total_deaths}`);
    }

    /**
     * Save checkpoint after milestone completion
     * @param {string} milestoneName
     */
    saveCheckpoint(milestoneName) {
        const checkpointsDir = path.join(this.contextDir, 'checkpoints');

        if (!existsSync(checkpointsDir)) {
            mkdirSync(checkpointsDir, { recursive: true });
        }

        const checkpoint = {
            milestone: milestoneName,
            completed_at: Date.now(),
            inventory: this.agent ? this.getInventorySummary() : {},
            position: this.agent?.bot?.entity?.position || null,
            health: this.agent?.bot?.health || 20,
            total_deaths: this.progress.total_deaths,
            completed_milestones: [...this.progress.completed_milestones]
        };

        const checkpointFile = path.join(checkpointsDir, `checkpoint-${milestoneName}.json`);

        try {
            writeFileSync(checkpointFile, JSON.stringify(checkpoint, null, 2));
            console.log(`[MilestoneTracker] Checkpoint saved: ${checkpointFile}`);
        } catch (error) {
            console.error('[MilestoneTracker] Error saving checkpoint:', error.message);
        }
    }

    /**
     * Get summary of bot's inventory
     * @returns {Object}
     */
    getInventorySummary() {
        if (!this.agent?.bot?.inventory) {
            return {};
        }

        const summary = {};
        const items = this.agent.bot.inventory.items();

        for (const item of items) {
            summary[item.name] = (summary[item.name] || 0) + item.count;
        }

        return summary;
    }

    /**
     * Get strategy for a specific milestone
     * @param {string} milestoneName
     * @returns {Object|null}
     */
    getStrategy(milestoneName) {
        return this.strategies[milestoneName] || null;
    }

    /**
     * Check if bot has required items for a milestone
     * @param {string} milestoneName
     * @returns {boolean}
     */
    hasRequiredItems(milestoneName) {
        const strategy = this.getStrategy(milestoneName);

        if (!strategy || !strategy.required_inventory) {
            return true; // No requirements
        }

        const inventory = this.getInventorySummary();

        for (const requiredItem of strategy.required_inventory) {
            if (!inventory[requiredItem] || inventory[requiredItem] < 1) {
                console.log(`[MilestoneTracker] Missing required item: ${requiredItem}`);
                return false;
            }
        }

        return true;
    }

    /**
     * Get a helpful status message
     * @returns {string}
     */
    getStatusMessage() {
        const progress = this.getProgress();
        const current = this.getCurrentMilestone();

        if (current.name === 'complete') {
            return '🎉 All survival milestones complete! You have achieved diamond tools!';
        }

        const percentage = Math.round(progress.completion_percentage);
        const completed = progress.completed_milestones.join(', ') || 'none';

        return `Survival Progress: ${percentage}% complete
Completed: ${completed}
Current: ${current.name}
Next: ${progress.next_milestone}
Deaths: ${progress.deaths}`;
    }
}
