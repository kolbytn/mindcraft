/**
 * Minecraft Survival Priority System
 *
 * Defines task priorities for orchestration in survival mode.
 * Higher priority tasks execute first to ensure survival.
 */

export const Priority = {
    CRITICAL: 0,  // P0 - Immediate survival needs (tools, shelter)
    HIGH: 1,      // P1 - Resource gathering, defense
    MEDIUM: 2,    // P2 - Building projects, farms
    LOW: 3        // P3 - Optimization, decoration
};

/**
 * Minecraft Survival Priorities (Speedrun-inspired)
 * Based on typical survival gameplay and speedrun strategies
 */
export const SurvivalTasks = {
    // P0: CRITICAL - First 2 minutes (must have before nightfall)
    CRAFT_TABLE: { priority: Priority.CRITICAL, time: '30s', desc: 'First crafting table from 4 planks' },
    WOODEN_PICKAXE: { priority: Priority.CRITICAL, time: '30s', desc: 'First pickaxe for mining stone' },
    STONE_TOOLS: { priority: Priority.CRITICAL, time: '2min', desc: 'Stone pickaxe, axe, sword (11 cobble)' },
    BASIC_SHELTER: { priority: Priority.CRITICAL, time: '5min', desc: 'Quick shelter or dig hole before night' },

    // P1: HIGH - First 8 minutes (needed for early survival)
    GATHER_WOOD: { priority: Priority.HIGH, time: '2-3min', desc: 'Collect 20-64 wood logs' },
    GATHER_STONE: { priority: Priority.HIGH, time: '2-3min', desc: 'Mine 20-32 cobblestone' },
    GATHER_FOOD: { priority: Priority.HIGH, time: '2-3min', desc: 'Hunt animals for food (8-16 meat)' },
    MAKE_BED: { priority: Priority.HIGH, time: '3min', desc: 'Get wool (3 sheep) + craft bed to skip night' },
    MAKE_TORCHES: { priority: Priority.HIGH, time: '1min', desc: 'Craft torches (coal or charcoal)' },

    // P2: MEDIUM - First 20 minutes (quality of life, expansion)
    BUILD_HOUSE: { priority: Priority.MEDIUM, time: '10-15min', desc: 'Proper house with walls, roof, door' },
    BUILD_FARM: { priority: Priority.MEDIUM, time: '8-12min', desc: 'Wheat/carrot farm for food' },
    MAKE_FURNACE: { priority: Priority.MEDIUM, time: '1min', desc: 'Furnace for smelting/cooking' },
    MAKE_CHEST: { priority: Priority.MEDIUM, time: '1min', desc: 'Storage chest' },
    MINE_IRON: { priority: Priority.MEDIUM, time: '10min', desc: 'Find and mine iron ore' },

    // P3: LOW - After 20 minutes (optimization, advanced builds)
    DECORATE: { priority: Priority.LOW, time: 'varies', desc: 'Decoration, aesthetics' },
    ADVANCED_BUILDS: { priority: Priority.LOW, time: 'varies', desc: 'Redstone, complex farms' },
    ENCHANTING: { priority: Priority.LOW, time: '30min+', desc: 'Enchanting table and books' }
};

/**
 * Time constraints for Minecraft day/night cycle
 */
export const MinecraftTime = {
    DAY_LENGTH: 600,      // 10 minutes (600 seconds) real time
    NIGHT_START: 600,     // Night starts at 10 minutes
    NIGHT_LENGTH: 420,    // 7 minutes (420 seconds)
    DAY_START: 1020,      // Day starts at 17 minutes (10+7)

    // Critical deadlines
    FIRST_NIGHT: 600,     // Must have shelter by 10 minutes
    SAFE_BUFFER: 480      // Aim to finish shelter by 8 minutes (2 min buffer)
};

/**
 * Resource requirements for common tasks
 */
export const ResourceNeeds = {
    CRAFTING_TABLE: {
        planks: 4
    },
    WOODEN_PICKAXE: {
        planks: 3,
        sticks: 2
    },
    STONE_TOOLS_SET: {
        cobblestone: 11,  // pickaxe (3) + axe (3) + sword (2) + shovel (1) + extra (2)
        sticks: 8
    },
    BED: {
        wool: 3,
        planks: 3
    },
    TORCHES_16: {
        coal_or_charcoal: 4,
        sticks: 4
    },
    BASIC_SHELTER: {
        dirt_or_wood: 32,
        door: 1,
        torches: 4
    },
    SIMPLE_HOUSE: {
        planks: 128,
        cobblestone: 32,
        door: 1,
        torches: 16,
        glass: 4
    }
};

/**
 * Determine priority of a task based on keyword analysis
 *
 * @param {string} taskDescription - Description of the task
 * @param {object} context - Game context (time, inventory, etc.)
 * @returns {number} Priority level (0-3)
 */
export function determineTaskPriority(taskDescription, context = {}) {
    const desc = taskDescription.toLowerCase();

    // Check for critical keywords
    if (desc.includes('crafting table') ||
        desc.includes('craft table') ||
        desc.includes('pickaxe') ||
        desc.includes('tools') && context.hasTools === false) {
        return Priority.CRITICAL;
    }

    if (desc.includes('shelter') ||
        desc.includes('protection') ||
        desc.includes('safe')) {
        // Shelter is CRITICAL if night is approaching
        if (context.timeUntilNight && context.timeUntilNight < 180) {
            return Priority.CRITICAL;
        }
        return Priority.HIGH;
    }

    if (desc.includes('gather') ||
        desc.includes('collect') ||
        desc.includes('mine') ||
        desc.includes('food') ||
        desc.includes('bed')) {
        return Priority.HIGH;
    }

    if (desc.includes('build') ||
        desc.includes('house') ||
        desc.includes('farm')) {
        return Priority.MEDIUM;
    }

    // Default to MEDIUM for unrecognized tasks
    return Priority.MEDIUM;
}

/**
 * Get tasks that should be injected before the main task
 * (e.g., if user asks to build a house but has no tools, inject tool crafting first)
 *
 * @param {object} context - Game context (inventory, tools, time)
 * @returns {Array} Array of prerequisite tasks to inject
 */
export function getPrerequisiteTasks(context = {}) {
    const prerequisites = [];

    // Check if we have basic tools
    if (!context.hasCraftingTable) {
        prerequisites.push({
            task: 'Create crafting table',
            priority: Priority.CRITICAL,
            bots: [{role: 'Gatherer', resource: 'oak_log', quantity: 4}]
        });
    }

    if (!context.hasWoodenPickaxe && !context.hasStonePickaxe) {
        prerequisites.push({
            task: 'Craft wooden pickaxe',
            priority: Priority.CRITICAL,
            bots: [{role: 'Crafter', items: ['wooden_pickaxe']}]
        });
    }

    if (!context.hasStoneTools) {
        prerequisites.push({
            task: 'Gather cobblestone and craft stone tools',
            priority: Priority.CRITICAL,
            bots: [
                {role: 'Gatherer', resource: 'cobblestone', quantity: 11},
                {role: 'Crafter', items: ['stone_pickaxe', 'stone_axe', 'stone_sword']}
            ]
        });
    }

    // Check if night is approaching and we have no shelter
    if (context.timeUntilNight && context.timeUntilNight < 300 && !context.hasShelter) {
        prerequisites.push({
            task: 'Build emergency shelter before night',
            priority: Priority.CRITICAL,
            bots: [
                {role: 'Gatherer', resource: 'dirt', quantity: 32},
                {role: 'Builder', task: 'dig_shelter'}
            ]
        });
    }

    return prerequisites;
}

/**
 * Sort tasks by priority
 *
 * @param {Array} tasks - Array of task objects with priority property
 * @returns {Array} Sorted array (highest priority first)
 */
export function sortByPriority(tasks) {
    return tasks.sort((a, b) => a.priority - b.priority);
}
