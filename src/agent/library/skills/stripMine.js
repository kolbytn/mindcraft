import * as world from "../world.js";
import pf from 'mineflayer-pathfinder';
import Vec3 from 'vec3';
import { log } from '../log.js';

import { breakBlockAt } from './breakBlockAt.js';

/**
 * Performs a strip mining operation to efficiently extract ores and resources.
 * 
 * This function executes the following steps:
 * 1. Navigates the bot to a specified Y-level (default: -58) using pathfinding or manual descent.
 * 2. Creates a main shaft of a specified length (default: 50 blocks) and width (default: 1 block).
 * 3. From the main shaft, creates multiple side shafts on both sides at regular intervals:
 *    - Side shaft length: 20 blocks (default)
 *    - Spacing between side shafts: 3 blocks (default)
 * 
 * During mining, the bot will:
 * - Break blocks to create shafts
 * - Collect any exposed ores
 * - Specifically target certain ores if specified in the targetedOres parameter
 * 
 * The strip mine pattern maximizes ore exposure while minimizing the number of blocks mined.
 * 
 * @param {Bot} bot - The Mineflayer bot instance to perform the mining operation.
 * @param {string[]} targetedOres - Optional array of ore names to specifically target during mining.
 *                                  If null, the bot will collect all exposed ores.
 * @returns {Promise<boolean>} - Returns true when the entire strip mining operation is complete.
 */
export async function stripMine(bot, targetedOres = null) {
    const targetY = -58;
    const mainShaftLength = 50;
    const sideShaftLength = 20;
    const sideShaftSpacing = 3;
    const mainShaftWidth = 1;

    // Go to the target Y level using pathfinder
    bot.pathfinder.setMovements(new pf.Movements(bot));
    const goal = new pf.goals.GoalY(targetY);
    try {
        await bot.pathfinder.goto(goal);
    } catch (error) {
        console.log("Pathfinding to target Y failed, attempting manual descent");
        await manualDescend(bot, targetY);
    }


    // Create the main shaft
    const startPos = bot.entity.position.clone();
    await createMainShaft(bot, startPos, mainShaftLength, mainShaftWidth, targetedOres);

    // Create side shafts
    for (let i = 0; i < Math.floor(mainShaftLength / sideShaftSpacing); i++) {
        const leftShaftStart = startPos.offset(0, 0, i * sideShaftSpacing);
        const rightShaftStart = leftShaftStart.offset(mainShaftWidth - 1, 0, 0);

        // Create left side shaft
        await createSideShaft(bot, leftShaftStart, sideShaftLength, 'left', targetedOres);

        // Create right side shaft
        await createSideShaft(bot, rightShaftStart, sideShaftLength, 'right', targetedOres);
    }

    return true
}

/**
 * Attempts to safely move the bot to a specified position.
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {number} x - The x-coordinate of the destination.
 * @param {number} y - The y-coordinate of the destination.
 * @param {number} z - The z-coordinate of the destination.
 */
async function safeMove(bot, x, y, z) {
    const goal = new pf.goals.GoalNear(x, y, z, 1);
    try {
        await bot.pathfinder.goto(goal);
    } catch (error) {
        log(bot, `Pathfinding failed, trying to dig to the destination.`);
        await digPath(bot, x, y, z);
    }
}

/**
 * Digs a path to the specified coordinates when pathfinding fails.
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {number} x - The x-coordinate of the destination.
 * @param {number} y - The y-coordinate of the destination.
 * @param {number} z - The z-coordinate of the destination.
 */
async function digPath(bot, x, y, z) {
    const start = bot.entity.position.clone();
    const end = new Vec3(x, y, z);
    const direction = end.minus(start).normalize();
    let current = start.clone();

    while (current.distanceTo(end) > 1) {
        current.add(direction);
        await breakBlockAt(bot, Math.floor(current.x), Math.floor(current.y), Math.floor(current.z));
        await breakBlockAt(bot, Math.floor(current.x), Math.floor(current.y) + 1, Math.floor(current.z));
        await bot.pathfinder.goto(new pf.goals.GoalBlock(Math.floor(current.x), Math.floor(current.y), Math.floor(current.z)));
    }
}

/**
 * Manually descends to the target Y level by breaking blocks beneath the bot.
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {number} targetY - The target Y-coordinate to descend to.
 */
async function manualDescend(bot, targetY) {
    while (Math.floor(bot.entity.position.y) > targetY) {
        await breakBlockAt(bot, bot.entity.position.x, bot.entity.position.y - 1, bot.entity.position.z);
        await safeMove(bot, bot.entity.position.x, bot.entity.position.y - 1, bot.entity.position.z);
    }
}

/**
 * Creates the main shaft of the strip mine.
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {Vec3} startPos - The starting position of the main shaft.
 * @param {number} length - The length of the main shaft.
 * @param {number} width - The width of the main shaft.
 * @param {string[]} targetedOres - Array of ore names to specifically target.
 */
async function createMainShaft(bot, startPos, length, width, targetedOres) {
    for (let z = 0; z < length; z++) {
        for (let x = 0; x < width; x++) {
            const pos = startPos.offset(x, 0, z);
            await breakBlockAt(bot, pos.x, pos.y, pos.z);
            await breakBlockAt(bot, pos.x, pos.y + 1, pos.z);
            await safeMove(bot, pos.x, pos.y, pos.z);
            await checkSurroundingBlocks(bot, pos.x, pos.y, pos.z, targetedOres);
        }
    }
}

/**
 * Creates a side shaft branching off from the main shaft.
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {Vec3} startPos - The starting position of the side shaft.
 * @param {number} length - The length of the side shaft.
 * @param {string} direction - The direction of the side shaft ('left' or 'right').
 * @param {string[]} targetedOres - Array of ore names to specifically target.
 */
async function createSideShaft(bot, startPos, length, direction, targetedOres) {
    const directionVector = direction === 'left' ? new Vec3(-1, 0, 0) : new Vec3(1, 0, 0);

    for (let i = 0; i < length; i++) {
        const pos = startPos.plus(directionVector.scaled(i));
        await breakBlockAt(bot, pos.x, pos.y, pos.z);
        await breakBlockAt(bot, pos.x, pos.y + 1, pos.z);
        await safeMove(bot, pos.x, pos.y, pos.z);

        await checkSurroundingBlocks(bot, pos.x, pos.y, pos.z, targetedOres);
    }

    // Return to the main shaft
    await safeMove(bot, startPos.x, startPos.y, startPos.z);
}

/**
 * Checks the surrounding blocks for targeted ores.
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {number} x - The x-coordinate of the center block.
 * @param {number} y - The y-coordinate of the center block.
 * @param {number} z - The z-coordinate of the center block.
 * @param {string[]} targetedOres - Array of ore names to specifically target.
 */
async function checkSurroundingBlocks(bot, x, y, z, targetedOres = null) {
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 2; dy++) {
            for (let dz = -1; dz <= 1; dz++) {
                if (dx === 0 && dy === 0 && dz === 0) continue;
                const block = bot.blockAt(new Vec3(x + dx, y + dy, z + dz));
                if (block) {
                    const shouldMine = targetedOres 
                        ? targetedOres.includes(block.name)
                        : block.name.includes('ore');
                    
                    if (shouldMine) {
                        log(bot, `Found ${block.name} at (${x + dx}, ${y + dy}, ${z + dz})`);
                        await mineOreVein(bot, x + dx, y + dy, z + dz, block.name);
                    }
                }
            }
        }
    }
}

/**
 * Mines an entire vein of ore.
 * @param {Bot} bot - The Mineflayer bot instance.
 * @param {number} x - The x-coordinate of the starting ore block.
 * @param {number} y - The y-coordinate of the starting ore block.
 * @param {number} z - The z-coordinate of the starting ore block.
 * @param {string} oreName - The name of the ore to mine.
 */
async function mineOreVein(bot, x, y, z, oreName) {
    const minedBlocks = new Set();
    const toMine = [[x, y, z]];

    while (toMine.length > 0) {
        const [currentX, currentY, currentZ] = toMine.pop();
        const key = `${currentX},${currentY},${currentZ}`;

        if (minedBlocks.has(key)) continue;

        const block = bot.blockAt(new Vec3(currentX, currentY, currentZ));
        if (block && block.name === oreName) {
            await bot.collectBlock.collect(block);
            minedBlocks.add(key);

            // Check surrounding blocks
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dz = -1; dz <= 1; dz++) {
                        if (dx === 0 && dy === 0 && dz === 0) continue;
                        const newX = currentX + dx;
                        const newY = currentY + dy;
                        const newZ = currentZ + dz;
                        const newKey = `${newX},${newY},${newZ}`;

                        if (!minedBlocks.has(newKey)) {
                            toMine.push([newX, newY, newZ]);
                        }
                    }
                }
            }
        }
    }

    log(bot, `Finished mining ${oreName} vein. Mined ${minedBlocks.size} blocks.`);
}