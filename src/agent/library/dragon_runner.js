/**
 * dragon_runner.js — Autonomous Ender Dragon progression system (RC29).
 *
 * Six modular gameplay chunks that chain together for a full
 * fresh-world → Ender Dragon defeat run:
 *   Chunk 1: getDiamondPickaxe  (already in skills.js)
 *   Chunk 2: buildNetherPortal
 *   Chunk 3: collectBlazeRods
 *   Chunk 4: collectEnderPearls
 *   Chunk 5: locateStronghold
 *   Chunk 6: defeatEnderDragon
 *
 * Plus the meta-orchestrator: runDragonProgression()
 *
 * RC29 upgrades:
 *   - Persistent state via DragonProgress (survives restarts/deaths)
 *   - Smart orchestrator with exponential backoff
 *   - Death recovery with gear re-acquisition
 *   - Dimension-aware navigation
 *   - Proactive food/gear management between chunks
 *
 * All functions use existing skill primitives from skills.js and world.js.
 * Each is idempotent — safe to call multiple times (skips completed steps).
 */

import * as skills from './skills.js';
import * as world from './world.js';
import { DragonProgress, CHUNKS } from './dragon_progress.js';
import { ProgressReporter } from './progress_reporter.js';
import Vec3 from 'vec3';

function log(bot, msg) {
    skills.log(bot, msg);
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/** Count a specific item in inventory */
function countItem(bot, name) {
    return (world.getInventoryCounts(bot)[name] || 0);
}

/** Check if we have at least `n` of item */
function hasItem(bot, name, n = 1) {
    return countItem(bot, name) >= n;
}

/** Ensure the bot has food and eats if hungry */
async function eatIfNeeded(bot) {
    if (bot.food < 14) {
        await skills.ensureFed(bot);
    }
}

/** Get the bot's current dimension */
function getDimension(bot) {
    const dim = bot.game?.dimension || 'overworld';
    if (dim.includes('nether')) return 'the_nether';
    if (dim.includes('end')) return 'the_end';
    return 'overworld';
}

/** Ensure we have enough of an item, trying to craft then collect */
async function _ensureItem(bot, itemName, count, craftFrom = null) {
    let have = countItem(bot, itemName);
    if (have >= count) return true;

    if (craftFrom) {
        const needed = count - have;
        for (let i = 0; i < needed; i++) {
            if (bot.interrupt_code) return false;
            if (!await skills.craftRecipe(bot, itemName, 1)) break;
        }
        have = countItem(bot, itemName);
        if (have >= count) return true;
    }

    const needed = count - countItem(bot, itemName);
    if (needed > 0) {
        await skills.collectBlock(bot, itemName, needed);
    }
    return countItem(bot, itemName) >= count;
}

// ═══════════════════════════════════════════════════════════════════════════
// PRE-CHUNK PREPARATION & DEATH RECOVERY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ensure minimum gear and food before starting a chunk.
 * Adapts requirements based on which chunk is next.
 */
async function prepareForChunk(bot, chunkName, progress) {
    log(bot, `Preparing for chunk: ${chunkName}`);
    if (bot.interrupt_code) return;

    // Always eat first
    await eatIfNeeded(bot);

    // Ensure food stockpile (min 12 cooked meat)
    const foodItems = ['cooked_beef', 'cooked_porkchop', 'cooked_mutton', 'cooked_chicken',
        'bread', 'baked_potato', 'cooked_salmon', 'cooked_cod', 'apple', 'carrot'];
    let totalFood = 0;
    const inv = world.getInventoryCounts(bot);
    for (const f of foodItems) totalFood += (inv[f] || 0);

    if (totalFood < 12) {
        log(bot, `Food low (${totalFood}). Stockpiling...`);
        await skills.stockpileFood(bot, 20);
    }

    // RC30: Proactive inventory overflow — place a chest and store junk if nearly full
    const emptySlots = bot.inventory.emptySlotCount();
    if (emptySlots < 6 && getDimension(bot) === 'overworld') {
        log(bot, `Inventory nearly full (${emptySlots} empty). Placing chest for overflow...`);
        const nearbyChest = world.getNearestBlock(bot, 'chest', 32);
        if (!nearbyChest && hasItem(bot, 'chest')) {
            // Place a chest at current position
            const pos = bot.entity.position;
            try {
                await skills.placeBlock(bot, 'chest',
                    Math.floor(pos.x) + 1, Math.floor(pos.y), Math.floor(pos.z), 'side');
            } catch (_e) {
                log(bot, 'Could not place overflow chest.');
            }
        }
    }

    // Manage inventory (stores in nearby chests or discards junk)
    await skills.autoManageInventory(bot);

    // Chunk-specific prep
    switch (chunkName) {
        case CHUNKS.BLAZE_RODS:
        case CHUNKS.ENDER_PEARLS:
            // Need a sword for combat chunks
            if (!hasItem(bot, 'diamond_sword') && !hasItem(bot, 'iron_sword')) {
                if (hasItem(bot, 'iron_ingot', 2)) {
                    await skills.craftRecipe(bot, 'iron_sword', 1);
                } else if (hasItem(bot, 'cobblestone', 2)) {
                    await skills.craftRecipe(bot, 'stone_sword', 1);
                }
            }
            break;

        case CHUNKS.DRAGON_FIGHT:
            // Max out gear before the End
            if (!hasItem(bot, 'diamond_sword') && hasItem(bot, 'diamond', 2)) {
                await skills.craftRecipe(bot, 'diamond_sword', 1);
            }
            // Collect cobblestone for pillaring
            if (countItem(bot, 'cobblestone') < 64 && getDimension(bot) === 'overworld') {
                await skills.collectBlock(bot, 'cobblestone', 64);
            }
            break;
    }

    // Update milestones
    progress.updateMilestones(bot);
    await progress.save();
}

/**
 * After death: try to recover items by going to death location.
 * Then re-acquire minimum gear if recovery failed.
 * RC30: Hardened recovery — full tool chain re-crafting, dimension-aware
 * portal linking safety, armor re-equip.
 */
async function recoverFromDeath(bot, progress) {
    log(bot, 'Death recovery initiated...');

    const deathPos = progress.getCoord('lastDeathPos');
    const deathDim = progress.getDimension();
    const currentDim = getDimension(bot);

    // RC30: Portal linking safety — if we died in the Nether but respawned in Overworld,
    // and we have a saved portal coord, navigate to portal first before attempting recovery
    if (deathDim === 'the_nether' && currentDim === 'overworld') {
        const portalCoord = progress.getCoord('overworldPortal');
        if (portalCoord) {
            log(bot, `Died in Nether, respawned in Overworld. Heading to saved portal: ${portalCoord.join(', ')}`);
            try {
                await skills.goToPosition(bot, portalCoord[0], portalCoord[1], portalCoord[2], 3);
                // Wait for portal transition
                await skills.wait(bot, 5000);
            } catch (_e) {
                log(bot, 'Could not reach Overworld portal. Will re-acquire gear in Overworld.');
            }
        }
    }

    // Attempt item recovery only if in the same dimension as death
    if (deathPos && getDimension(bot) === deathDim) {
        log(bot, `Heading to death location: ${deathPos.join(', ')}`);
        try {
            await skills.goToPosition(bot, deathPos[0], deathPos[1], deathPos[2], 3);
            await skills.pickupNearbyItems(bot);
            log(bot, 'Picked up items near death location.');
        } catch (_e) {
            log(bot, 'Could not reach death location.');
        }
    } else if (deathPos) {
        log(bot, `Death was in ${deathDim} but currently in ${getDimension(bot)}. Skipping item recovery.`);
    }

    // RC30: Full inventory check and re-acquisition chain
    const inv = world.getInventoryCounts(bot);
    const hasPickaxe = inv['diamond_pickaxe'] || inv['iron_pickaxe'] || inv['stone_pickaxe'];
    const hasSword = inv['diamond_sword'] || inv['iron_sword'] || inv['stone_sword'];

    if (!hasPickaxe) {
        log(bot, 'Lost pickaxe! Full tool chain re-crafting...');
        // Step 1: Get wood (try multiple tree types)
        let gotWood = false;
        for (const logType of ['oak_log', 'birch_log', 'spruce_log', 'dark_oak_log', 'acacia_log', 'jungle_log']) {
            if (bot.interrupt_code) return;
            if (hasItem(bot, logType, 1)) { gotWood = true; break; }
            try {
                await skills.collectBlock(bot, logType, 4);
                if (countItem(bot, logType) > 0) { gotWood = true; break; }
            } catch (_e) { /* try next type */ }
        }
        if (gotWood) {
            // Step 2: Craft basic tools
            const planksType = Object.keys(world.getInventoryCounts(bot))
                .find(k => k.endsWith('_log'));
            if (planksType) {
                const planksName = planksType.replace('_log', '_planks');
                await skills.craftRecipe(bot, planksName, 1);
                await skills.craftRecipe(bot, 'stick', 1);
                await skills.craftRecipe(bot, 'crafting_table', 1);
                await skills.craftRecipe(bot, 'wooden_pickaxe', 1);
                // Step 3: Upgrade to stone
                try {
                    await skills.collectBlock(bot, 'cobblestone', 8);
                    await skills.craftRecipe(bot, 'stone_pickaxe', 1);
                    await skills.craftRecipe(bot, 'stone_sword', 1);
                } catch (_e) {
                    log(bot, 'Could not gather cobblestone for stone tools.');
                }
                // Step 4: Try for iron if we have time
                if (!bot.interrupt_code && getDimension(bot) === 'overworld') {
                    try {
                        await skills.collectBlock(bot, 'iron_ore', 3);
                        if (countItem(bot, 'raw_iron') >= 3 || countItem(bot, 'iron_ore') >= 3) {
                            await skills.smeltItem(bot, 'raw_iron', 3);
                            await skills.craftRecipe(bot, 'iron_pickaxe', 1);
                        }
                    } catch (_e) {
                        log(bot, 'Could not upgrade to iron. Stone tools will suffice.');
                    }
                }
            }
        }
    }

    if (!hasSword) {
        log(bot, 'Lost sword! Crafting replacement...');
        if (hasItem(bot, 'iron_ingot', 2)) {
            await skills.craftRecipe(bot, 'iron_sword', 1);
        } else if (hasItem(bot, 'cobblestone', 2) || hasItem(bot, 'cobbled_deepslate', 2)) {
            await skills.craftRecipe(bot, 'stone_sword', 1);
        } else {
            // Desperate: craft wooden sword
            const logTypes = Object.keys(world.getInventoryCounts(bot)).filter(k => k.endsWith('_log'));
            if (logTypes.length > 0) {
                const planksName = logTypes[0].replace('_log', '_planks');
                await skills.craftRecipe(bot, planksName, 1);
                await skills.craftRecipe(bot, 'stick', 1);
                await skills.craftRecipe(bot, 'wooden_sword', 1);
            }
        }
    }

    // RC30: Re-equip armor if we have any
    const armorSlots = ['head', 'torso', 'legs', 'feet'];
    const armorPriority = {
        head: ['diamond_helmet', 'iron_helmet', 'chainmail_helmet', 'leather_helmet'],
        torso: ['diamond_chestplate', 'iron_chestplate', 'chainmail_chestplate', 'leather_chestplate'],
        legs: ['diamond_leggings', 'iron_leggings', 'chainmail_leggings', 'leather_leggings'],
        feet: ['diamond_boots', 'iron_boots', 'chainmail_boots', 'leather_boots'],
    };
    for (const slot of armorSlots) {
        for (const armorName of armorPriority[slot]) {
            const armorItem = bot.inventory.items().find(i => i.name === armorName);
            if (armorItem) {
                try { await bot.equip(armorItem, slot); } catch (_e) { /* best effort */ }
                break;
            }
        }
    }

    // Stock up food
    await skills.stockpileFood(bot, 16);
    await eatIfNeeded(bot);
}

// ═══════════════════════════════════════════════════════════════════════════
// CHUNK 2: Build a Nether Portal
// ═══════════════════════════════════════════════════════════════════════════

export async function buildNetherPortal(bot) {
    /**
     * Build a nether portal using one of two methods:
     * (A) If the bot already has 10+ obsidian and flint_and_steel, build directly.
     * (B) Otherwise, use water bucket + lava source to cast obsidian in place.
     * Requires: iron_pickaxe or diamond_pickaxe, bucket, flint_and_steel.
     * @param {MinecraftBot} bot
     * @returns {Promise<boolean>} true if nether portal is built and lit.
     **/
    log(bot, '=== CHUNK 2: Build Nether Portal ===');

    // Check prerequisites
    const inv = world.getInventoryCounts(bot);
    const hasPickaxe = (inv['diamond_pickaxe'] || 0) > 0 || (inv['iron_pickaxe'] || 0) > 0;
    if (!hasPickaxe) {
        log(bot, 'Need at least an iron pickaxe first. Running getDiamondPickaxe...');
        if (!await skills.getDiamondPickaxe(bot)) {
            log(bot, 'Cannot get a pickaxe. Aborting nether portal.');
            return false;
        }
    }

    await eatIfNeeded(bot);

    // Ensure we have flint and steel
    if (!hasItem(bot, 'flint_and_steel')) {
        // Need iron ingot + flint
        if (!hasItem(bot, 'iron_ingot')) {
            // Mine and smelt iron
            let gotIron = await skills.collectBlock(bot, 'iron_ore', 1);
            if (!gotIron) gotIron = await skills.collectBlock(bot, 'deepslate_iron_ore', 1);
            if (gotIron) await skills.smeltItem(bot, 'raw_iron', 1);
        }
        if (!hasItem(bot, 'flint')) {
            await skills.collectBlock(bot, 'gravel', 5); // flint drops from gravel
            // Check if we got flint from mining gravel
            if (!hasItem(bot, 'flint')) {
                // Mine more gravel
                for (let i = 0; i < 10 && !hasItem(bot, 'flint'); i++) {
                    if (bot.interrupt_code) return false;
                    await skills.collectBlock(bot, 'gravel', 3);
                }
            }
        }
        if (hasItem(bot, 'iron_ingot') && hasItem(bot, 'flint')) {
            await skills.craftRecipe(bot, 'flint_and_steel', 1);
        }
        if (!hasItem(bot, 'flint_and_steel')) {
            log(bot, 'Cannot craft flint_and_steel. Need iron_ingot + flint.');
            return false;
        }
    }

    // Ensure we have a bucket
    if (!hasItem(bot, 'bucket') && !hasItem(bot, 'water_bucket') && !hasItem(bot, 'lava_bucket')) {
        if (hasItem(bot, 'iron_ingot', 3)) {
            await skills.craftRecipe(bot, 'bucket', 1);
        } else {
            // Need more iron
            let gotIron = await skills.collectBlock(bot, 'iron_ore', 3);
            if (!gotIron) gotIron = await skills.collectBlock(bot, 'deepslate_iron_ore', 3);
            if (gotIron) await skills.smeltItem(bot, 'raw_iron', 3);
            if (hasItem(bot, 'iron_ingot', 3)) {
                await skills.craftRecipe(bot, 'bucket', 1);
            }
        }
    }

    // Method A: If we already have 10 obsidian, build directly
    if (hasItem(bot, 'obsidian', 10)) {
        return await buildPortalFromObsidian(bot);
    }

    // Method B: Cast obsidian portal using water + lava
    log(bot, 'Casting obsidian portal with water + lava method...');

    // Get water bucket
    if (!hasItem(bot, 'water_bucket')) {
        const waterBlock = world.getNearestBlock(bot, 'water', 64);
        if (waterBlock) {
            await skills.goToPosition(bot, waterBlock.position.x, waterBlock.position.y, waterBlock.position.z, 2);
            // Equip bucket and right-click water
            const bucket = bot.inventory.items().find(i => i.name === 'bucket');
            if (bucket) {
                await bot.equip(bucket, 'hand');
                try {
                    const wBlock = bot.blockAt(waterBlock.position);
                    if (wBlock) await bot.activateBlock(wBlock);
                } catch (_e) { /* try useOn fallback */ }
            }
        }
        if (!hasItem(bot, 'water_bucket')) {
            log(bot, 'Cannot find water source for bucket. Attempting direct mining of obsidian...');
            return await mineObsidianDirect(bot);
        }
    }

    // Find or create a lava source underground
    log(bot, 'Finding lava source for portal casting...');

    // Dig down to find lava (common near Y=10)
    const currentY = Math.floor(bot.entity.position.y);
    if (currentY > 15) {
        const digDist = currentY - 11;
        await skills.digDown(bot, digDist);
    }

    // Find lava nearby
    let lavaBlock = world.getNearestBlock(bot, 'lava', 32);
    if (!lavaBlock) {
        log(bot, 'No lava found nearby. Exploring at depth...');
        await skills.explore(bot, 40);
        lavaBlock = world.getNearestBlock(bot, 'lava', 32);
    }
    if (!lavaBlock) {
        log(bot, 'Could not find lava. Try a different location.');
        return false;
    }

    // Cast obsidian: pour water on lava source blocks
    log(bot, 'Found lava! Casting obsidian...');
    await skills.goToPosition(bot, lavaBlock.position.x, lavaBlock.position.y, lavaBlock.position.z, 3);

    // Mine the obsidian we create — need at least 10 blocks
    let obsidianCount = countItem(bot, 'obsidian');
    let attempts = 0;
    while (obsidianCount < 10 && attempts < 25) {
        if (bot.interrupt_code) return false;
        attempts++;
        await eatIfNeeded(bot);

        // Pour water on lava
        lavaBlock = world.getNearestBlock(bot, 'lava', 8);
        if (!lavaBlock) {
            lavaBlock = world.getNearestBlock(bot, 'lava', 32);
            if (!lavaBlock) break;
            await skills.goToPosition(bot, lavaBlock.position.x, lavaBlock.position.y, lavaBlock.position.z, 3);
        }

        // Place water near lava
        const waterBucket = bot.inventory.items().find(i => i.name === 'water_bucket');
        if (waterBucket) {
            await bot.equip(waterBucket, 'hand');
            try {
                const aboveLava = bot.blockAt(lavaBlock.position.offset(0, 1, 0));
                if (aboveLava) await bot.activateBlock(aboveLava);
            } catch (_e) { /* best effort */ }
            await new Promise(r => setTimeout(r, 1000));

            // Pick water back up
            const waterBlock = world.getNearestBlock(bot, 'water', 5);
            if (waterBlock) {
                const emptyBucket = bot.inventory.items().find(i => i.name === 'bucket');
                if (emptyBucket) {
                    await bot.equip(emptyBucket, 'hand');
                    try {
                        const wb = bot.blockAt(waterBlock.position);
                        if (wb) await bot.activateBlock(wb);
                    } catch (_e) { /* best effort */ }
                }
            }
        }

        // Mine newly created obsidian
        const obsidian = world.getNearestBlock(bot, 'obsidian', 8);
        if (obsidian) {
            // Need diamond pickaxe to mine obsidian
            const diamPick = bot.inventory.items().find(i => i.name === 'diamond_pickaxe');
            if (diamPick) {
                await bot.equip(diamPick, 'hand');
                await skills.breakBlockAt(bot, obsidian.position.x, obsidian.position.y, obsidian.position.z);
                await skills.pickupNearbyItems(bot);
            } else {
                log(bot, 'Need diamond pickaxe to mine obsidian!');
                return false;
            }
        }

        obsidianCount = countItem(bot, 'obsidian');
        log(bot, `Obsidian progress: ${obsidianCount}/10`);
    }

    if (obsidianCount < 10) {
        log(bot, `Only got ${obsidianCount} obsidian. Need 10. Try again.`);
        return false;
    }

    // Go to surface and build the portal
    await skills.goToSurface(bot);
    return await buildPortalFromObsidian(bot);
}

async function mineObsidianDirect(bot) {
    /** Mine 10 obsidian directly (slow — need diamond pickaxe) */
    if (!hasItem(bot, 'diamond_pickaxe')) {
        log(bot, 'Need diamond pickaxe to mine obsidian.');
        return false;
    }

    log(bot, 'Mining obsidian directly...');
    let obsidian = countItem(bot, 'obsidian');
    let attempts = 0;
    while (obsidian < 10 && attempts < 30) {
        if (bot.interrupt_code) return false;
        attempts++;
        const block = world.getNearestBlock(bot, 'obsidian', 32);
        if (!block) {
            await skills.explore(bot, 40);
            continue;
        }
        const pick = bot.inventory.items().find(i => i.name === 'diamond_pickaxe');
        if (pick) await bot.equip(pick, 'hand');
        await skills.breakBlockAt(bot, block.position.x, block.position.y, block.position.z);
        await skills.pickupNearbyItems(bot);
        obsidian = countItem(bot, 'obsidian');
    }

    if (obsidian < 10) return false;

    await skills.goToSurface(bot);
    return await buildPortalFromObsidian(bot);
}

async function buildPortalFromObsidian(bot) {
    /** Build a standard 4x5 nether portal frame and light it */
    log(bot, 'Building nether portal frame...');
    const pos = bot.entity.position;
    const bx = Math.floor(pos.x) + 2;
    const by = Math.floor(pos.y);
    const bz = Math.floor(pos.z);

    // Standard portal frame: 4 wide x 5 tall, only the frame blocks
    // Bottom row (2 blocks)
    const portalBlocks = [
        // Bottom
        [bx + 1, by, bz], [bx + 2, by, bz],
        // Left column
        [bx, by + 1, bz], [bx, by + 2, bz], [bx, by + 3, bz],
        // Right column
        [bx + 3, by + 1, bz], [bx + 3, by + 2, bz], [bx + 3, by + 3, bz],
        // Top row
        [bx + 1, by + 4, bz], [bx + 2, by + 4, bz],
    ];

    for (const [px, py, pz] of portalBlocks) {
        if (bot.interrupt_code) return false;
        const block = bot.blockAt(new Vec3(px, py, pz));
        if (block && block.name !== 'obsidian') {
            // Clear the block first if not air
            if (block.name !== 'air') {
                await skills.breakBlockAt(bot, px, py, pz);
            }
            await skills.placeBlock(bot, 'obsidian', px, py, pz, 'bottom', true);
        }
    }

    // Clear the portal interior (2x3)
    for (let dx = 1; dx <= 2; dx++) {
        for (let dy = 1; dy <= 3; dy++) {
            const block = bot.blockAt(new Vec3(bx + dx, by + dy, bz));
            if (block && block.name !== 'air') {
                await skills.breakBlockAt(bot, bx + dx, by + dy, bz);
            }
        }
    }

    // Light the portal with flint and steel
    log(bot, 'Lighting nether portal...');
    const flintSteel = bot.inventory.items().find(i => i.name === 'flint_and_steel');
    if (flintSteel) {
        await bot.equip(flintSteel, 'hand');
        const insideBlock = bot.blockAt(new Vec3(bx + 1, by + 1, bz));
        if (insideBlock) {
            try {
                await bot.activateBlock(insideBlock);
            } catch (_e) {
                // Try activating the bottom obsidian
                const bottomBlock = bot.blockAt(new Vec3(bx + 1, by, bz));
                if (bottomBlock) await bot.activateBlock(bottomBlock);
            }
        }
    }

    // Check if portal is active
    await new Promise(r => setTimeout(r, 2000));
    const portalBlock = world.getNearestBlock(bot, 'nether_portal', 8);
    if (portalBlock) {
        log(bot, 'Nether portal built and activated!');
        // Remember portal location
        bot.memory_bank?.rememberPlace?.('overworld_portal',
            Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z));
        return true;
    }

    log(bot, 'Portal frame built but not activated. May need to manually light it.');
    return false;
}

// ═══════════════════════════════════════════════════════════════════════════
// CHUNK 3: Collect Blaze Rods
// ═══════════════════════════════════════════════════════════════════════════

export async function collectBlazeRods(bot, count = 12) {
    /**
     * Travel to the Nether, find a Nether Fortress, and kill Blazes for rods.
     * Prerequisites: nether portal exists, good gear + food.
     * @param {MinecraftBot} bot
     * @param {number} count - number of blaze rods to collect. Default 12.
     * @returns {Promise<boolean>} true if enough blaze rods collected.
     **/
    log(bot, `=== CHUNK 3: Collect ${count} Blaze Rods ===`);

    const currentRods = countItem(bot, 'blaze_rod');
    if (currentRods >= count) {
        log(bot, `Already have ${currentRods} blaze rods!`);
        return true;
    }

    // Ensure we have gear
    await eatIfNeeded(bot);
    await skills.autoManageInventory(bot);

    // Check we're prepared
    const inv = world.getInventoryCounts(bot);
    if (!inv['iron_sword'] && !inv['diamond_sword'] && !inv['stone_sword']) {
        log(bot, 'Need a sword before entering the Nether.');
        // Try to craft one
        if (inv['iron_ingot'] >= 2) {
            await skills.craftRecipe(bot, 'iron_sword', 1);
        } else if (inv['cobblestone'] >= 2) {
            await skills.craftRecipe(bot, 'stone_sword', 1);
        }
    }

    // Enter nether portal
    const portal = world.getNearestBlock(bot, 'nether_portal', 64);
    if (!portal) {
        log(bot, 'No nether portal found! Build one first with !buildNetherPortal.');
        return false;
    }

    log(bot, 'Entering nether portal...');
    await skills.goToPosition(bot, portal.position.x, portal.position.y, portal.position.z, 0);

    // Wait for dimension change
    await new Promise(r => setTimeout(r, 8000));

    // Check if we're in the nether
    const dimension = bot.game?.dimension || 'overworld';
    if (!dimension.includes('nether') && !dimension.includes('the_nether')) {
        log(bot, 'Failed to enter the Nether. Standing on portal...');
        // Try stepping into the portal
        await new Promise(r => setTimeout(r, 5000));
    }

    // Search for nether fortress (nether_bricks)
    log(bot, 'Searching for Nether Fortress...');
    let fortressFound = false;
    let searchAttempts = 0;

    while (!fortressFound && searchAttempts < 15) {
        if (bot.interrupt_code) return false;
        searchAttempts++;
        await eatIfNeeded(bot);

        // Look for nether_bricks which indicate a fortress
        const bricks = world.getNearestBlock(bot, 'nether_bricks', 64);
        if (bricks) {
            log(bot, 'Found Nether Fortress!');
            await skills.goToPosition(bot, bricks.position.x, bricks.position.y, bricks.position.z, 3);
            fortressFound = true;
        } else {
            log(bot, `Fortress search attempt ${searchAttempts}/15...`);
            // Travel in a consistent direction through the nether
            const pos = bot.entity.position;
            const angle = (searchAttempts * 0.6) * Math.PI; // spiral pattern
            const dist = 50 + searchAttempts * 20;
            const targetX = pos.x + Math.cos(angle) * dist;
            const targetZ = pos.z + Math.sin(angle) * dist;
            await skills.goToPosition(bot, targetX, pos.y, targetZ, 5);
        }
    }

    if (!fortressFound) {
        log(bot, 'Could not find a Nether Fortress after extensive search.');
        return false;
    }

    // Hunt blazes
    log(bot, 'Hunting blazes for blaze rods...');
    let rods = countItem(bot, 'blaze_rod');
    let huntAttempts = 0;

    while (rods < count && huntAttempts < 40) {
        if (bot.interrupt_code) return false;
        huntAttempts++;
        await eatIfNeeded(bot);

        // Check health — retreat if low
        if (bot.health < 8) {
            log(bot, 'Low health! Building emergency shelter...');
            await skills.buildPanicRoom(bot);
        }

        const blaze = world.getNearestEntityWhere(bot, e => e.name === 'blaze', 48);
        if (blaze) {
            // Prefer ranged attack for blazes
            const hasBow = hasItem(bot, 'bow') && hasItem(bot, 'arrow');
            if (hasBow) {
                await skills.rangedAttack(bot, 'blaze');
            } else {
                log(bot, 'Fighting blaze in melee...');
                await skills.attackEntity(bot, blaze, true);
            }
            await skills.pickupNearbyItems(bot);
        } else {
            // Explore fortress to find blaze spawners
            log(bot, 'No blazes visible. Searching fortress...');
            const spawner = world.getNearestBlock(bot, 'spawner', 32);
            if (spawner) {
                await skills.goToPosition(bot, spawner.position.x, spawner.position.y, spawner.position.z, 5);
                await skills.wait(bot, 5000); // Wait for blazes to spawn
            } else {
                await skills.explore(bot, 30);
            }
        }

        rods = countItem(bot, 'blaze_rod');
        log(bot, `Blaze rods: ${rods}/${count}`);
    }

    if (rods >= count) {
        log(bot, `Collected ${rods} blaze rods! Heading back to portal...`);
    } else {
        log(bot, `Only got ${rods}/${count} blaze rods. May need to retry.`);
    }

    return rods >= count;
}

// ═══════════════════════════════════════════════════════════════════════════
// CHUNK 4: Collect Ender Pearls
// ═══════════════════════════════════════════════════════════════════════════

export async function collectEnderPearls(bot, count = 12) {
    /**
     * Collect ender pearls by hunting Endermen. Works in both Overworld and Nether.
     * Endermen are taller, so look at their feet to aggro them safely.
     * @param {MinecraftBot} bot
     * @param {number} count - target ender pearls. Default 12.
     * @returns {Promise<boolean>} true if enough ender pearls collected.
     **/
    log(bot, `=== CHUNK 4: Collect ${count} Ender Pearls ===`);

    let pearls = countItem(bot, 'ender_pearl');
    if (pearls >= count) {
        log(bot, `Already have ${pearls} ender pearls!`);
        return true;
    }

    await eatIfNeeded(bot);
    await skills.autoManageInventory(bot);

    // Ensure we have a good sword
    const inv = world.getInventoryCounts(bot);
    if (!inv['diamond_sword'] && !inv['iron_sword']) {
        if (inv['iron_ingot'] >= 2) {
            await skills.craftRecipe(bot, 'iron_sword', 1);
        }
    }

    log(bot, 'Hunting Endermen for ender pearls...');
    let attempts = 0;

    while (pearls < count && attempts < 50) {
        if (bot.interrupt_code) return false;
        attempts++;
        await eatIfNeeded(bot);

        if (bot.health < 8) {
            await skills.buildPanicRoom(bot);
        }

        // Find an enderman
        const enderman = world.getNearestEntityWhere(bot, e => e.name === 'enderman', 48);

        if (enderman) {
            log(bot, `Found Enderman! Distance: ${Math.floor(bot.entity.position.distanceTo(enderman.position))}`);

            // Get close enough
            if (bot.entity.position.distanceTo(enderman.position) > 5) {
                await skills.goToPosition(bot,
                    enderman.position.x, enderman.position.y, enderman.position.z, 4);
            }

            // Look at its feet to aggro it (looking at head triggers teleportation aggro)
            await bot.lookAt(enderman.position.offset(0, 0.5, 0));
            await new Promise(r => setTimeout(r, 500));

            // Attack
            await skills.attackEntity(bot, enderman, true);
            await skills.pickupNearbyItems(bot);
        } else {
            // Endermen spawn more at night and in specific biomes
            const timeOfDay = bot.time?.timeOfDay || 0;
            if (timeOfDay < 13000) {
                log(bot, 'Waiting for night (endermen spawn more at night)...');
                await skills.wait(bot, 5000);
            } else {
                // Explore to find endermen
                await skills.explore(bot, 80);
            }
        }

        pearls = countItem(bot, 'ender_pearl');
        if (attempts % 5 === 0) {
            log(bot, `Ender pearls: ${pearls}/${count} (attempt ${attempts})`);
        }
    }

    log(bot, `Collected ${pearls} ender pearls.`);
    return pearls >= count;
}

// ═══════════════════════════════════════════════════════════════════════════
// CHUNK 5: Locate Stronghold & Enter the End
// ═══════════════════════════════════════════════════════════════════════════

export async function locateStronghold(bot) {
    /**
     * Craft eyes of ender, throw them to triangulate the stronghold,
     * dig down to find it, locate the end portal, and activate it.
     * Prerequisites: blaze rods + ender pearls.
     * @param {MinecraftBot} bot
     * @returns {Promise<boolean>} true if end portal found and activated.
     **/
    log(bot, '=== CHUNK 5: Locate Stronghold & Enter the End ===');

    // Craft blaze powder from blaze rods
    const blazeRods = countItem(bot, 'blaze_rod');
    const blazePowder = countItem(bot, 'blaze_powder');
    const enderPearls = countItem(bot, 'ender_pearl');
    const eyesOfEnder = countItem(bot, 'ender_eye');

    const totalEyes = eyesOfEnder;
    const canCraftEyes = Math.min(
        blazeRods * 2 + blazePowder,
        enderPearls
    );

    if (totalEyes + canCraftEyes < 12) {
        log(bot, `Not enough materials for 12 eyes of ender. Have: ${eyesOfEnder} eyes, ${blazeRods} rods, ${enderPearls} pearls.`);
        return false;
    }

    // Craft blaze powder
    if (blazeRods > 0 && countItem(bot, 'blaze_powder') < enderPearls) {
        const rodsToCraft = Math.min(blazeRods, Math.ceil((enderPearls - blazePowder) / 2));
        await skills.craftRecipe(bot, 'blaze_powder', rodsToCraft);
    }

    // Craft eyes of ender
    const currentEyes = countItem(bot, 'ender_eye');
    if (currentEyes < 12) {
        const toCraft = Math.min(
            countItem(bot, 'blaze_powder'),
            countItem(bot, 'ender_pearl'),
            12 - currentEyes
        );
        for (let i = 0; i < toCraft; i++) {
            if (bot.interrupt_code) return false;
            await skills.craftRecipe(bot, 'ender_eye', 1);
        }
    }

    const finalEyes = countItem(bot, 'ender_eye');
    if (finalEyes < 12) {
        log(bot, `Only crafted ${finalEyes} eyes of ender. Need 12.`);
        return false;
    }

    log(bot, `Crafted ${finalEyes} eyes of ender. Triangulating stronghold...`);

    // Throw eyes of ender to find stronghold direction
    // The eye floats toward the stronghold then drops
    // We need 2 throws from different positions to triangulate

    const throw1Pos = bot.entity.position.clone();
    let throw1Dir = null;
    let throw2Dir = null;

    // First throw
    log(bot, 'Throwing first eye of ender...');
    const eye1 = bot.inventory.items().find(i => i.name === 'ender_eye');
    if (eye1) {
        await bot.equip(eye1, 'hand');
        await bot.look(0, 0); // look forward
        bot.activateItem();
        await new Promise(r => setTimeout(r, 3000));

        // The eye entity should appear and float in a direction
        // Watch for thrown ender eye entity
        const eyeEntity = world.getNearestEntityWhere(bot, e =>
            e.name === 'eye_of_ender' || e.name === 'ender_eye', 32);
        if (eyeEntity) {
            const eyePos = eyeEntity.position;
            throw1Dir = {
                x: eyePos.x - throw1Pos.x,
                z: eyePos.z - throw1Pos.z
            };
            log(bot, `Eye flew toward (${Math.floor(eyePos.x)}, ${Math.floor(eyePos.z)})`);
        }
    }

    // Move perpendicular for second throw
    if (throw1Dir) {
        const perpX = throw1Pos.x + (-throw1Dir.z > 0 ? 200 : -200);
        const perpZ = throw1Pos.z + (throw1Dir.x > 0 ? 200 : -200);
        log(bot, 'Moving for second triangulation throw...');
        await skills.goToPosition(bot, perpX, bot.entity.position.y, perpZ, 10);
    } else {
        // First throw failed, just move and try again
        await skills.explore(bot, 200);
    }

    const throw2Pos = bot.entity.position.clone();

    // Second throw
    log(bot, 'Throwing second eye of ender...');
    const eye2 = bot.inventory.items().find(i => i.name === 'ender_eye');
    if (eye2) {
        await bot.equip(eye2, 'hand');
        await bot.look(0, 0);
        bot.activateItem();
        await new Promise(r => setTimeout(r, 3000));

        const eyeEntity2 = world.getNearestEntityWhere(bot, e =>
            e.name === 'eye_of_ender' || e.name === 'ender_eye', 32);
        if (eyeEntity2) {
            throw2Dir = {
                x: eyeEntity2.position.x - throw2Pos.x,
                z: eyeEntity2.position.z - throw2Pos.z
            };
        }
    }

    // Estimate stronghold position from two throws
    let targetX, targetZ;
    if (throw1Dir && throw2Dir) {
        // Line intersection to find stronghold
        const det = throw1Dir.x * throw2Dir.z - throw1Dir.z * throw2Dir.x;
        if (Math.abs(det) > 0.01) {
            const t = ((throw2Pos.x - throw1Pos.x) * throw2Dir.z - (throw2Pos.z - throw1Pos.z) * throw2Dir.x) / det;
            targetX = throw1Pos.x + throw1Dir.x * t;
            targetZ = throw1Pos.z + throw1Dir.z * t;
            log(bot, `Stronghold estimated at (${Math.floor(targetX)}, ${Math.floor(targetZ)})`);
        } else {
            // Lines are parallel, just follow the first direction
            targetX = throw1Pos.x + throw1Dir.x * 100;
            targetZ = throw1Pos.z + throw1Dir.z * 100;
        }
    } else {
        // Fallback: strongholds typically generate 1000-3000 blocks from origin
        // in ring patterns. Head toward origin at ~1500 block radius
        const pos = bot.entity.position;
        const distFromOrigin = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
        if (distFromOrigin > 2000) {
            targetX = pos.x * 0.6; // Move toward origin
            targetZ = pos.z * 0.6;
        } else {
            targetX = pos.x + 500;
            targetZ = pos.z + 500;
        }
        log(bot, `Eye tracking failed. Heading toward estimated stronghold area...`);
    }

    // Navigate to estimated position
    log(bot, 'Traveling to stronghold area...');
    await skills.goToPosition(bot, targetX, bot.entity.position.y, targetZ, 20);

    // Keep throwing eyes to refine position until they go DOWN
    log(bot, 'Refining position with more eye throws...');
    let goingDown = false;
    let refineAttempts = 0;
    while (!goingDown && refineAttempts < 10) {
        if (bot.interrupt_code) return false;
        refineAttempts++;
        await eatIfNeeded(bot);

        const eyeItem = bot.inventory.items().find(i => i.name === 'ender_eye');
        if (!eyeItem) {
            log(bot, 'Ran out of eyes of ender!');
            return false;
        }

        await bot.equip(eyeItem, 'hand');
        bot.activateItem();
        await new Promise(r => setTimeout(r, 3000));

        const flyingEye = world.getNearestEntityWhere(bot, e =>
            e.name === 'eye_of_ender' || e.name === 'ender_eye', 32);
        if (flyingEye) {
            const eyeY = flyingEye.position.y;
            const botY = bot.entity.position.y;
            if (eyeY < botY) {
                // Eye went DOWN — stronghold is below us!
                goingDown = true;
                log(bot, 'Eye went underground — stronghold is directly below!');
            } else {
                // Still need to follow
                await skills.goToPosition(bot,
                    flyingEye.position.x, bot.entity.position.y, flyingEye.position.z, 10);
            }
        }
        await skills.pickupNearbyItems(bot); // Recover dropped eye
    }

    // Dig down to find the stronghold
    log(bot, 'Digging down to stronghold...');
    await skills.digDown(bot, 40);

    // Search for end portal frame blocks
    let portalFrame = null;
    let searchAttempts = 0;
    while (!portalFrame && searchAttempts < 20) {
        if (bot.interrupt_code) return false;
        searchAttempts++;

        portalFrame = world.getNearestBlock(bot, 'end_portal_frame', 32);
        if (!portalFrame) {
            // Look for stone_bricks (stronghold material)
            const stoneBricks = world.getNearestBlock(bot, 'stone_bricks', 32);
            if (stoneBricks) {
                log(bot, 'Found stronghold stonework! Searching for portal room...');
                await skills.goToPosition(bot,
                    stoneBricks.position.x, stoneBricks.position.y, stoneBricks.position.z, 2);
            }
            await skills.explore(bot, 20);
        }
    }

    if (!portalFrame) {
        log(bot, 'Could not find end portal frame. Dig around in the stronghold to find it.');
        return false;
    }

    log(bot, 'Found end portal frame! Filling with eyes of ender...');
    await skills.goToPosition(bot,
        portalFrame.position.x, portalFrame.position.y, portalFrame.position.z, 3);

    // Fill all portal frames with eyes of ender
    const frames = bot.findBlocks({
        matching: block => block && block.name === 'end_portal_frame',
        maxDistance: 16,
        count: 12
    });

    let filled = 0;
    for (const framePos of frames) {
        if (bot.interrupt_code) return false;
        const frameBlock = bot.blockAt(framePos);
        if (!frameBlock) continue;

        // Check if frame already has an eye (metadata check)
        // end_portal_frame has property 'eye' which is true/false
        const hasEye = frameBlock.getProperties?.()?.eye === 'true' ||
                       frameBlock.getProperties?.()?.eye === true;
        if (hasEye) {
            filled++;
            continue;
        }

        // Place eye of ender in frame
        const eyeItem = bot.inventory.items().find(i => i.name === 'ender_eye');
        if (!eyeItem) {
            log(bot, 'Ran out of eyes of ender!');
            return false;
        }

        await bot.equip(eyeItem, 'hand');
        try {
            await bot.activateBlock(frameBlock);
            filled++;
            await new Promise(r => setTimeout(r, 500));
        } catch (_e) {
            log(bot, 'Failed to place eye in frame.');
        }
    }

    log(bot, `Filled ${filled}/${frames.length} portal frames.`);

    // Check if portal is active
    await new Promise(r => setTimeout(r, 2000));
    const endPortal = world.getNearestBlock(bot, 'end_portal', 16);
    if (endPortal) {
        log(bot, 'End portal is ACTIVE! Ready to enter.');
        // Remember location
        const pos = bot.entity.position;
        bot.memory_bank?.rememberPlace?.('end_portal',
            Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z));
        return true;
    }

    log(bot, 'Portal frames placed but portal not active. May need more eyes.');
    return false;
}

// ═══════════════════════════════════════════════════════════════════════════
// CHUNK 6: Defeat the Ender Dragon
// ═══════════════════════════════════════════════════════════════════════════

export async function defeatEnderDragon(bot) {
    /**
     * Enter The End and defeat the Ender Dragon.
     * Strategy: destroy end crystals first, then attack dragon during perching.
     * Requires: strong weapon, bow + arrows, blocks for pillaring, food.
     * @param {MinecraftBot} bot
     * @returns {Promise<boolean>} true if dragon defeated.
     **/
    log(bot, '=== CHUNK 6: Defeat the Ender Dragon ===');

    await eatIfNeeded(bot);

    // Ensure we have needed supplies
    const inv = world.getInventoryCounts(bot);
    const hasSword = inv['diamond_sword'] || inv['iron_sword'];
    const hasBow = inv['bow'] && (inv['arrow'] || 0) >= 32;
    const hasBlocks = (inv['cobblestone'] || 0) >= 64;

    if (!hasSword) {
        log(bot, 'Need a sword for dragon fight.');
        if (inv['diamond'] >= 2) await skills.craftRecipe(bot, 'diamond_sword', 1);
        else if (inv['iron_ingot'] >= 2) await skills.craftRecipe(bot, 'iron_sword', 1);
    }

    if (!hasBow) {
        log(bot, 'Bow + arrows strongly recommended for end crystals.');
    }

    // Ensure we have blocks for pillaring up to crystals
    if (!hasBlocks) {
        await skills.collectBlock(bot, 'cobblestone', 64);
    }

    // Enter the end portal
    const endPortal = world.getNearestBlock(bot, 'end_portal', 16);
    if (!endPortal) {
        log(bot, 'No end portal found! Run !locateStronghold first.');
        return false;
    }

    log(bot, 'Jumping into the End...');
    await skills.goToPosition(bot, endPortal.position.x, endPortal.position.y, endPortal.position.z, 0);
    await new Promise(r => setTimeout(r, 10000)); // Wait for dimension transfer

    // In The End now
    log(bot, 'Arrived in The End. Beginning dragon fight!');

    // Phase 1: Destroy end crystals on obsidian pillars
    log(bot, 'Phase 1: Destroying end crystals...');
    let crystalsDestroyed = 0;
    let crystalAttempts = 0;

    while (crystalAttempts < 30) {
        if (bot.interrupt_code) return false;
        crystalAttempts++;
        await eatIfNeeded(bot);

        // Health check
        if (bot.health < 8) {
            log(bot, 'Low health! Eating and hiding...');
            await skills.buildPanicRoom(bot);
        }

        // Find end crystals
        const crystal = world.getNearestEntityWhere(bot, e =>
            e.name === 'end_crystal' || e.name === 'ender_crystal', 64);

        if (!crystal) {
            log(bot, `All visible crystals destroyed (${crystalsDestroyed} confirmed).`);
            break;
        }

        const dist = bot.entity.position.distanceTo(crystal.position);
        log(bot, `End crystal found at distance ${Math.floor(dist)}`);

        if (hasBow && dist > 8) {
            // Shoot the crystal with bow
            await skills.rangedAttack(bot, crystal.name);
            crystalsDestroyed++;
        } else {
            // Pillar up and melee the crystal
            // Get close first
            await skills.goToPosition(bot,
                crystal.position.x, bot.entity.position.y, crystal.position.z, 4);

            // If crystal is high up, pillar
            const heightDiff = crystal.position.y - bot.entity.position.y;
            if (heightDiff > 3) {
                log(bot, `Pillaring up ${Math.floor(heightDiff)} blocks...`);
                const pos = bot.entity.position;
                for (let i = 0; i < Math.floor(heightDiff); i++) {
                    if (bot.interrupt_code) return false;
                    await skills.placeBlock(bot, 'cobblestone',
                        Math.floor(pos.x), Math.floor(pos.y) + i, Math.floor(pos.z), 'bottom', true);
                    bot.setControlState('jump', true);
                    await new Promise(r => setTimeout(r, 400));
                    bot.setControlState('jump', false);
                }
            }

            // Attack the crystal (causes explosion — back away!)
            try {
                await bot.attack(crystal);
                crystalsDestroyed++;
                log(bot, 'Crystal destroyed! (watch for explosion damage)');
            } catch (_e) {
                log(bot, 'Failed to attack crystal directly.');
            }

            // Move away from explosion
            await skills.moveAway(bot, 5);
        }
    }

    // Phase 2: Fight the dragon
    log(bot, 'Phase 2: Fighting the Ender Dragon!');
    let dragonAlive = true;
    let fightAttempts = 0;

    while (dragonAlive && fightAttempts < 100) {
        if (bot.interrupt_code) return false;
        fightAttempts++;
        await eatIfNeeded(bot);

        // RC30: Golden apple priority when health is critical during dragon fight
        if (bot.health < 10) {
            const inv = world.getInventoryCounts(bot);
            const gapple = (inv['golden_apple'] || 0) > 0 ? 'golden_apple'
                : (inv['enchanted_golden_apple'] || 0) > 0 ? 'enchanted_golden_apple' : null;
            if (gapple) {
                log(bot, `Critical health (${bot.health.toFixed(1)})! Eating ${gapple}!`);
                await skills.consume(bot, gapple);
            }
        }

        if (bot.health < 8) {
            await skills.buildPanicRoom(bot);
        }

        // RC30: Void edge avoidance — check before we get too close
        const pos = bot.entity.position;
        if (pos.y < 5 || (Math.abs(pos.x) > 40 && pos.y < 55) || (Math.abs(pos.z) > 40 && pos.y < 55)) {
            log(bot, 'DANGER: Near void edge! Moving to center...');
            await skills.goToPosition(bot, 0, 64, 0, 10); // Center of End island
            continue;
        }

        // Find the dragon
        const dragon = world.getNearestEntityWhere(bot, e =>
            e.name === 'ender_dragon' || e.name === 'enderdragon', 128);

        if (!dragon) {
            // Dragon might be dead or far away
            const dragonEntity = world.getNearestEntityWhere(bot, e =>
                e.name === 'ender_dragon' || e.name === 'enderdragon', 256);
            if (!dragonEntity) {
                log(bot, 'Dragon not found. It might be defeated!');
                dragonAlive = false;
                break;
            }
            // Move toward center where dragon perches
            await skills.goToPosition(bot, 0, 64, 0, 10);
            await skills.wait(bot, 3000);
            continue;
        }

        const dist = bot.entity.position.distanceTo(dragon.position);

        // When dragon is perching on the fountain (near 0,64,0), it's vulnerable
        if (dragon.position.y < 70 && dist < 20) {
            log(bot, 'Dragon is perching! Attacking!');
            // Equip best sword
            await equipBestSword(bot);
            try {
                await bot.attack(dragon);
                await new Promise(r => setTimeout(r, 500));
                await bot.attack(dragon);
                await new Promise(r => setTimeout(r, 500));
                await bot.attack(dragon);
            } catch (_e) {
                // Dragon may have moved
            }
        } else if (hasBow && dist < 64) {
            // Shoot with bow when dragon is flying
            log(bot, 'Shooting dragon with bow...');
            const bow = bot.inventory.items().find(i => i.name === 'bow');
            if (bow) {
                await bot.equip(bow, 'hand');
                const predictedPos = dragon.position.offset(
                    (dragon.velocity?.x || 0) * 2,
                    (dragon.velocity?.y || 0) * 2 + 2,
                    (dragon.velocity?.z || 0) * 2
                );
                await bot.lookAt(predictedPos);
                bot.activateItem();
                await new Promise(r => setTimeout(r, 1200));
                bot.deactivateItem();
            }
        } else {
            // Move toward center and wait for dragon to perch
            await skills.goToPosition(bot, 0, 64, 0, 10);
            await skills.wait(bot, 2000);
        }

        // Check for experience orbs (dragon death indicator)
        const xpOrb = world.getNearestEntityWhere(bot, e =>
            e.name === 'experience_orb' || e.name === 'xp_orb', 32);
        if (xpOrb) {
            log(bot, 'Experience orbs detected — Dragon might be dead!');
            dragonAlive = false;
        }
    }

    if (!dragonAlive) {
        log(bot, '🐉 ENDER DRAGON DEFEATED! VICTORY!');
        await skills.pickupNearbyItems(bot);
        return true;
    }

    log(bot, 'Dragon fight timed out. May need to retry.');
    return false;
}

async function equipBestSword(bot) {
    const swords = bot.inventory.items().filter(i => i.name.includes('sword'));
    if (swords.length === 0) return;
    // Sort by attack damage (diamond > iron > stone > wooden)
    const priority = { 'netherite_sword': 5, 'diamond_sword': 4, 'iron_sword': 3, 'stone_sword': 2, 'golden_sword': 1, 'wooden_sword': 0 };
    swords.sort((a, b) => (priority[b.name] || 0) - (priority[a.name] || 0));
    await bot.equip(swords[0], 'hand');
}

// ═══════════════════════════════════════════════════════════════════════════
// META ORCHESTRATOR: Full Dragon Progression (RC29 — persistent + smart)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Complete autonomous run from fresh world to defeating the Ender Dragon.
 * Uses persistent DragonProgress to survive restarts and deaths.
 * Smart retry with exponential backoff, death recovery, dimension awareness.
 * @param {MinecraftBot} bot
 * @returns {Promise<boolean>} true if Ender Dragon defeated.
 */
export async function runDragonProgression(bot) {
    log(bot, '╔══════════════════════════════════════════════════╗');
    log(bot, '║  DRAGON PROGRESSION v2 (RC29): Smart Orchestrator║');
    log(bot, '╚══════════════════════════════════════════════════╝');

    // ── Load or initialize persistent state ────────────────────────────
    const botName = bot.username || bot.entity?.username || 'UnknownBot';
    const progress = new DragonProgress(botName);
    progress.load();

    // Log current state
    log(bot, progress.getSummary());

    // ── Register death handler for this run ────────────────────────────
    let deathOccurred = false;
    const deathHandler = () => {
        deathOccurred = true;
        const pos = bot.entity?.position;
        if (pos) {
            progress.recordDeath(pos.x, pos.y, pos.z, getDimension(bot));
        }
        progress.save().catch(err => console.error('[DragonProgress] Save on death failed:', err));
    };
    bot.on('death', deathHandler);

    // ── RC30: Start progress reporter ──────────────────────────────────
    const reporter = new ProgressReporter(bot, progress);
    reporter.start();

    // ── Chunk definitions ──────────────────────────────────────────────
    const chunkRunners = {
        [CHUNKS.DIAMOND_PICKAXE]: {
            name: 'Diamond Pickaxe',
            check: () => hasItem(bot, 'diamond_pickaxe') || progress.isChunkDone(CHUNKS.DIAMOND_PICKAXE),
            run: () => skills.getDiamondPickaxe(bot),
        },
        [CHUNKS.NETHER_PORTAL]: {
            name: 'Nether Portal',
            check: () => {
                if (progress.isChunkDone(CHUNKS.NETHER_PORTAL)) return true;
                return world.getNearestBlock(bot, 'nether_portal', 128) !== null;
            },
            run: () => buildNetherPortal(bot),
            onSuccess: () => {
                const p = bot.entity.position;
                progress.setCoord('overworldPortal', p.x, p.y, p.z);
            },
        },
        [CHUNKS.BLAZE_RODS]: {
            name: 'Blaze Rods',
            check: () => hasItem(bot, 'blaze_rod', 7) || progress.state.milestones.blazeRods >= 7,
            run: () => collectBlazeRods(bot, 12),
            onSuccess: () => {
                progress.updateMilestones(bot);
            },
        },
        [CHUNKS.ENDER_PEARLS]: {
            name: 'Ender Pearls',
            check: () => {
                const totalEyeMaterial = countItem(bot, 'ender_pearl') + countItem(bot, 'ender_eye');
                return totalEyeMaterial >= 12 || progress.state.milestones.eyesOfEnder >= 12;
            },
            run: () => collectEnderPearls(bot, 12),
            onSuccess: () => {
                progress.updateMilestones(bot);
            },
        },
        [CHUNKS.STRONGHOLD]: {
            name: 'Stronghold',
            check: () => {
                if (progress.isChunkDone(CHUNKS.STRONGHOLD)) return true;
                return world.getNearestBlock(bot, 'end_portal', 16) !== null;
            },
            run: () => locateStronghold(bot),
            onSuccess: () => {
                const p = bot.entity.position;
                progress.setCoord('stronghold', p.x, p.y, p.z);
                progress.setCoord('endPortal', p.x, p.y, p.z);
            },
        },
        [CHUNKS.DRAGON_FIGHT]: {
            name: 'Ender Dragon Fight',
            check: () => false, // Always attempt
            run: () => defeatEnderDragon(bot),
            onSuccess: () => {
                progress.setEnteredEnd(true);
            },
        },
    };

    // ── Main orchestration loop ────────────────────────────────────────
    const MAX_RETRIES_PER_CHUNK = 5;

    try {
        for (const chunkKey of DragonProgress.CHUNK_ORDER) {
            if (bot.interrupt_code) {
                log(bot, 'Dragon progression interrupted.');
                await progress.save();
                bot.removeListener('death', deathHandler);
                return false;
            }

            const runner = chunkRunners[chunkKey];
            const chunkIdx = DragonProgress.CHUNK_ORDER.indexOf(chunkKey) + 1;
            const totalChunks = DragonProgress.CHUNK_ORDER.length;

            // Skip completed chunks
            if (runner.check()) {
                if (!progress.isChunkDone(chunkKey)) {
                    progress.markChunkDone(chunkKey);
                    await progress.save();
                }
                log(bot, `[${chunkIdx}/${totalChunks}] ${runner.name} -- already complete, skipping.`);
                continue;
            }

            log(bot, `\n>> Chunk ${chunkIdx}/${totalChunks}: ${runner.name}`);

            // Pre-chunk preparation
            await prepareForChunk(bot, chunkKey, progress);

            let success = false;
            let retries = 0;

            while (!success && retries < MAX_RETRIES_PER_CHUNK) {
                if (bot.interrupt_code) break;
                retries++;

                // Handle death recovery between retries
                if (deathOccurred) {
                    deathOccurred = false;
                    log(bot, `Died during ${runner.name}. Recovering...`);
                    await new Promise(r => setTimeout(r, 3000)); // Wait for respawn
                    await recoverFromDeath(bot, progress);
                }

                progress.markChunkActive(chunkKey);
                await progress.save();

                const backoffMs = Math.min(1000 * Math.pow(2, retries - 1), 30000);
                if (retries > 1) {
                    log(bot, `Retry ${retries}/${MAX_RETRIES_PER_CHUNK} for ${runner.name} (backoff ${Math.round(backoffMs / 1000)}s)...`);
                    await new Promise(r => setTimeout(r, backoffMs));
                    await eatIfNeeded(bot);
                    // Explore to fresh area before retrying
                    if (getDimension(bot) === 'overworld') {
                        await skills.explore(bot, 100 + retries * 50);
                    }
                }

                try {
                    success = await runner.run();
                } catch (err) {
                    log(bot, `Chunk ${runner.name} error: ${err.message}`);
                    success = false;
                }

                if (success) {
                    // Run onSuccess hook
                    if (runner.onSuccess) {
                        try { runner.onSuccess(); } catch (_e) { /* best effort */ }
                    }
                    progress.markChunkDone(chunkKey);
                    progress.updateMilestones(bot);
                    await progress.save();
                    log(bot, `[${chunkIdx}/${totalChunks}] ${runner.name} -- COMPLETE!`);
                    reporter.onChunkChange(); // RC30: trigger progress report on chunk transition
                } else if (!bot.interrupt_code) {
                    progress.markChunkFailed(chunkKey);
                    await progress.save();
                }
            }

            if (!success) {
                log(bot, `Chunk ${runner.name} failed after ${MAX_RETRIES_PER_CHUNK} attempts.`);
                log(bot, 'Dragon progression paused. Run !beatMinecraft or !dragonProgression to resume.');
                await progress.save();
                bot.removeListener('death', deathHandler);
                return false;
            }
        }
    } finally {
        reporter.stop(); // RC30: stop progress reporter
        bot.removeListener('death', deathHandler);
    }

    // ── Victory! ───────────────────────────────────────────────────────
    log(bot, '\n== ENDER DRAGON DEFEATED! GG! ==');
    log(bot, progress.getSummary());
    await progress.save();
    return true;
}
