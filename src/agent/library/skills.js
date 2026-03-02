import * as mc from "../../utils/mcdata.js";
import * as world from "./world.js";
import baritoneModule from '@miner-org/mineflayer-baritone';
import pf from 'mineflayer-pathfinder'; // RC25: retained ONLY for Movements.safeToBreak() in collectBlock
import Vec3 from 'vec3';
import settings from "../../../settings.js";

// RC25: Baritone A* pathfinding goals (replaces mineflayer-pathfinder goals)
const baritoneGoals = baritoneModule.goals;

const blockPlaceDelay = settings.block_place_delay == null ? 0 : settings.block_place_delay;
const useDelay = blockPlaceDelay > 0;

export function log(bot, message) {
    bot.output += message + '\n';
}

async function autoLight(bot) {
    if (world.shouldPlaceTorch(bot)) {
        try {
            const pos = world.getPosition(bot);
            return await placeBlock(bot, 'torch', pos.x, pos.y, pos.z, 'bottom', true);
        } catch (_err) {return false;}
    }
    return false;
}

async function equipHighestAttack(bot) {
    let weapons = bot.inventory.items().filter(item => item.name.includes('sword') || (item.name.includes('axe') && !item.name.includes('pickaxe')));
    if (weapons.length === 0)
        weapons = bot.inventory.items().filter(item => item.name.includes('pickaxe') || item.name.includes('shovel'));
    if (weapons.length === 0)
        return;
    weapons.sort((a, b) => a.attackDamage < b.attackDamage);
    let weapon = weapons[0];
    if (weapon)
        await bot.equip(weapon, 'hand');
}

export async function craftRecipe(bot, itemName, num=1) {
    /**
     * Attempt to craft the given item name from a recipe. May craft many items.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} itemName, the item name to craft.
     * @returns {Promise<boolean>} true if the recipe was crafted, false otherwise.
     * @example
     * await skills.craftRecipe(bot, "stick");
     **/
    let placedTable = false;

    if (mc.getItemCraftingRecipes(itemName).length == 0) {
        log(bot, `${itemName} is either not an item, or it does not have a crafting recipe!`);
        return false;
    }

    // get recipes that don't require a crafting table
    let recipes = bot.recipesFor(mc.getItemId(itemName), null, 1, null); 
    let craftingTable = null;
    const craftingTableRange = 16;
    placeTable: if (!recipes || recipes.length === 0) {
        recipes = bot.recipesFor(mc.getItemId(itemName), null, 1, true);
        if(!recipes || recipes.length === 0) break placeTable; //Don't bother going to the table if we don't have the required resources.

        // Look for crafting table
        craftingTable = world.getNearestBlock(bot, 'crafting_table', craftingTableRange);
        if (craftingTable === null){

            // Try to place crafting table
            let hasTable = world.getInventoryCounts(bot)['crafting_table'] > 0;
            if (hasTable) {
                let pos = world.getNearestFreeSpace(bot, 1, 6);
                if (!pos) {
                    log(bot, `No free space to place crafting table.`);
                    return false;
                }
                await placeBlock(bot, 'crafting_table', pos.x, pos.y, pos.z);
                craftingTable = world.getNearestBlock(bot, 'crafting_table', craftingTableRange);
                if (craftingTable) {
                    recipes = bot.recipesFor(mc.getItemId(itemName), null, 1, craftingTable);
                    placedTable = true;
                }
            }
            else {
                log(bot, `Crafting ${itemName} requires a crafting table.`);
                return false;
            }
        }
        else {
            recipes = bot.recipesFor(mc.getItemId(itemName), null, 1, craftingTable);
        }
    }
    if (!recipes || recipes.length === 0) {
        log(bot, `You do not have the resources to craft a ${itemName}. It requires: ${Object.entries(mc.getItemCraftingRecipes(itemName)[0][0]).map(([key, value]) => `${key}: ${value}`).join(', ')}.`);
        if (placedTable) {
            await collectBlock(bot, 'crafting_table', 1);
        }
        return false;
    }
    
    if (craftingTable && bot.entity.position.distanceTo(craftingTable.position) > 4) {
        await goToNearestBlock(bot, 'crafting_table', 4, craftingTableRange);
    }

    const recipe = recipes[0];
    console.log('crafting...');
    //Check that the agent has sufficient items to use the recipe `num` times.
    const inventory = world.getInventoryCounts(bot); //Items in the agents inventory
    const requiredIngredients = mc.ingredientsFromPrismarineRecipe(recipe); //Items required to use the recipe once.
    const craftLimit = mc.calculateLimitingResource(inventory, requiredIngredients);
    
    try {
        await bot.craft(recipe, Math.min(craftLimit.num, num), craftingTable);
    } catch (err) {
        log(bot, `Failed to craft ${itemName}: ${err.message}`);
        if (placedTable) {
            await collectBlock(bot, 'crafting_table', 1);
        }
        return false;
    }
    if(craftLimit.num<num) log(bot, `Not enough ${craftLimit.limitingResource} to craft ${num}, crafted ${craftLimit.num}. You now have ${world.getInventoryCounts(bot)[itemName]} ${itemName}.`);
    else log(bot, `Successfully crafted ${itemName}, you now have ${world.getInventoryCounts(bot)[itemName]} ${itemName}.`);
    if (placedTable) {
        await collectBlock(bot, 'crafting_table', 1);
    }

    //Equip any armor the bot may have crafted.
    //There is probablly a more efficient method than checking the entire inventory but this is all mineflayer-armor-manager provides. :P
    bot.armorManager.equipAll();

    return true;
}

export async function wait(bot, milliseconds) {
    /**
     * Waits for the given number of milliseconds.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {number} milliseconds, the number of milliseconds to wait.
     * @returns {Promise<boolean>} true if the wait was successful, false otherwise.
     * @example
     * await skills.wait(bot, 1000);
     **/
    // setTimeout is disabled to prevent unawaited code, so this is a safe alternative that enables interrupts
    let timeLeft = milliseconds;
    let startTime = Date.now();
    
    while (timeLeft > 0) {
        if (bot.interrupt_code) return false;
        
        let waitTime = Math.min(2000, timeLeft);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        
        let elapsed = Date.now() - startTime;
        timeLeft = milliseconds - elapsed;
    }
    return true;
}

export async function smeltItem(bot, itemName, num=1) {
    /**
     * Puts 1 coal in furnace and smelts the given item name, waits until the furnace runs out of fuel or input items.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} itemName, the item name to smelt. Ores must contain "raw" like raw_iron.
     * @param {number} num, the number of items to smelt. Defaults to 1.
     * @returns {Promise<boolean>} true if the item was smelted, false otherwise. Fail
     * @example
     * await skills.smeltItem(bot, "raw_iron");
     * await skills.smeltItem(bot, "beef");
     **/

    if (!mc.isSmeltable(itemName)) {
        log(bot, `Cannot smelt ${itemName}. Hint: make sure you are smelting the 'raw' item.`);
        return false;
    }

    let placedFurnace = false;
    let furnaceBlock = undefined;
    const furnaceRange = 16;
    furnaceBlock = world.getNearestBlock(bot, 'furnace', furnaceRange);
    if (!furnaceBlock){
        // Try to place furnace
        let hasFurnace = world.getInventoryCounts(bot)['furnace'] > 0;
        if (hasFurnace) {
            let pos = world.getNearestFreeSpace(bot, 1, furnaceRange);
            await placeBlock(bot, 'furnace', pos.x, pos.y, pos.z);
            furnaceBlock = world.getNearestBlock(bot, 'furnace', furnaceRange);
            placedFurnace = true;
        }
    }
    if (!furnaceBlock){
        log(bot, `There is no furnace nearby and you have no furnace.`);
        return false;
    }
    if (bot.entity.position.distanceTo(furnaceBlock.position) > 4) {
        await goToNearestBlock(bot, 'furnace', 4, furnaceRange);
    }
    bot.modes.pause('unstuck');
    await bot.lookAt(furnaceBlock.position);

    console.log('smelting...');
    const furnace = await bot.openFurnace(furnaceBlock);
    // check if the furnace is already smelting something
    let input_item = furnace.inputItem();
    if (input_item && input_item.type !== mc.getItemId(itemName) && input_item.count > 0) {
        // TODO: check if furnace is currently burning fuel. furnace.fuel is always null, I think there is a bug.
        // This only checks if the furnace has an input item, but it may not be smelting it and should be cleared.
        log(bot, `The furnace is currently smelting ${mc.getItemName(input_item.type)}.`);
        if (placedFurnace)
            await collectBlock(bot, 'furnace', 1);
        return false;
    }
    // check if the bot has enough items to smelt
    let inv_counts = world.getInventoryCounts(bot);
    if (!inv_counts[itemName] || inv_counts[itemName] < num) {
        log(bot, `You do not have enough ${itemName} to smelt.`);
        if (placedFurnace)
            await collectBlock(bot, 'furnace', 1);
        return false;
    }

    // fuel the furnace
    if (!furnace.fuelItem()) {
        let fuel = mc.getSmeltingFuel(bot);
        if (!fuel) {
            log(bot, `You have no fuel to smelt ${itemName}, you need coal, charcoal, or wood.`);
            if (placedFurnace)
                await collectBlock(bot, 'furnace', 1);
            return false;
        }
        log(bot, `Using ${fuel.name} as fuel.`);

        const put_fuel = Math.ceil(num / mc.getFuelSmeltOutput(fuel.name));

        if (fuel.count < put_fuel) {
            log(bot, `You don't have enough ${fuel.name} to smelt ${num} ${itemName}; you need ${put_fuel}.`);
            if (placedFurnace)
                await collectBlock(bot, 'furnace', 1);
            return false;
        }
        await furnace.putFuel(fuel.type, null, put_fuel);
        log(bot, `Added ${put_fuel} ${mc.getItemName(fuel.type)} to furnace fuel.`);
        console.log(`Added ${put_fuel} ${mc.getItemName(fuel.type)} to furnace fuel.`);
    }
    // put the items in the furnace
    await furnace.putInput(mc.getItemId(itemName), null, num);
    // wait for the items to smelt
    let total = 0;
    let smelted_item = null;
    await new Promise(resolve => setTimeout(resolve, 200));
    let last_collected = Date.now();
    while (total < num) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (furnace.outputItem()) {
            smelted_item = await furnace.takeOutput();
            if (smelted_item) {
                total += smelted_item.count;
                last_collected = Date.now();
            }
        }
        if (Date.now() - last_collected > 11000) {
            break; // if nothing has been collected in 11 seconds, stop
        }
        if (bot.interrupt_code) {
            break;
        }
    }
    // take all remaining in input/fuel slots
    if (furnace.inputItem()) {
        await furnace.takeInput();
    }
    if (furnace.fuelItem()) {
        await furnace.takeFuel();
    }

    await bot.closeWindow(furnace);

    if (placedFurnace) {
        await collectBlock(bot, 'furnace', 1);
    }
    if (total === 0) {
        log(bot, `Failed to smelt ${itemName}.`);
        return false;
    }
    if (total < num) {
        log(bot, `Only smelted ${total} ${mc.getItemName(smelted_item.type)}.`);
        return false;
    }
    log(bot, `Successfully smelted ${itemName}, got ${total} ${mc.getItemName(smelted_item.type)}.`);
    return true;
}

export async function clearNearestFurnace(bot) {
    /**
     * Clears the nearest furnace of all items.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @returns {Promise<boolean>} true if the furnace was cleared, false otherwise.
     * @example
     * await skills.clearNearestFurnace(bot);
     **/
    let furnaceBlock = world.getNearestBlock(bot, 'furnace', 32);
    if (!furnaceBlock) {
        log(bot, `No furnace nearby to clear.`);
        return false;
    }
    if (bot.entity.position.distanceTo(furnaceBlock.position) > 4) {
        await goToNearestBlock(bot, 'furnace', 4, 32);
    }

    console.log('clearing furnace...');
    const furnace = await bot.openFurnace(furnaceBlock);
    console.log('opened furnace...');
    // take the items out of the furnace
    let smelted_item, intput_item, fuel_item;
    if (furnace.outputItem())
        smelted_item = await furnace.takeOutput();
    if (furnace.inputItem())
        intput_item = await furnace.takeInput();
    if (furnace.fuelItem())
        fuel_item = await furnace.takeFuel();
    console.log(smelted_item, intput_item, fuel_item);
    let smelted_name = smelted_item ? `${smelted_item.count} ${smelted_item.name}` : `0 smelted items`;
    let input_name = intput_item ? `${intput_item.count} ${intput_item.name}` : `0 input items`;
    let fuel_name = fuel_item ? `${fuel_item.count} ${fuel_item.name}` : `0 fuel items`;
    log(bot, `Cleared furnace, received ${smelted_name}, ${input_name}, and ${fuel_name}.`);
    return true;

}


export async function attackNearest(bot, mobType, kill=true) {
    /**
     * Attack mob of the given type.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} mobType, the type of mob to attack.
     * @param {boolean} kill, whether or not to continue attacking until the mob is dead. Defaults to true.
     * @returns {Promise<boolean>} true if the mob was attacked, false if the mob type was not found.
     * @example
     * await skills.attackNearest(bot, "zombie", true);
     **/
    bot.modes.pause('cowardice');
    if (mobType === 'drowned' || mobType === 'cod' || mobType === 'salmon' || mobType === 'tropical_fish' || mobType === 'squid')
        bot.modes.pause('self_preservation'); // so it can go underwater. TODO: have an drowning mode so we don't turn off all self_preservation
    const mob = world.getNearbyEntities(bot, 24).find(entity => entity.name === mobType);
    if (mob) {
        return await attackEntity(bot, mob, kill);
    }
    log(bot, 'Could not find any '+mobType+' to attack.');
    return false;
}

export async function attackEntity(bot, entity, kill=true) {
    /**
     * Attack mob of the given type.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {Entity} entity, the entity to attack.
     * @returns {Promise<boolean>} true if the entity was attacked, false if interrupted
     * @example
     * await skills.attackEntity(bot, entity);
     **/

    if (!entity || !bot.entities[entity.id]) {
        log(bot, 'Entity no longer exists, skipping attack.');
        return false;
    }

    let pos = entity.position;
    await equipHighestAttack(bot);

    if (!kill) {
        if (bot.entity.position.distanceTo(pos) > 5) {
            console.log('moving to mob...');
            await goToPosition(bot, pos.x, pos.y, pos.z);
        }
        if (!bot.entities[entity.id]) {
            log(bot, 'Entity despawned during approach, skipping attack.');
            return false;
        }
        console.log('attacking mob...');
        await bot.attack(entity);
    }
    else {
        if (!bot.entities[entity.id]) {
            log(bot, 'Entity despawned before pvp start, skipping attack.');
            return false;
        }
        bot.pvp.attack(entity);
        while (world.getNearbyEntities(bot, 24).includes(entity)) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (bot.interrupt_code) {
                bot.pvp.stop();
                return false;
            }
        }
        log(bot, `Successfully killed ${entity.name}.`);
        await pickupNearbyItems(bot);
        return true;
    }
}

export async function defendSelf(bot, range=9) {
    /**
     * Defend yourself from all nearby hostile mobs until there are no more.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {number} range, the range to look for mobs. Defaults to 8.
     * @returns {Promise<boolean>} true if the bot found any enemies and has killed them, false if no entities were found.
     * @example
     * await skills.defendSelf(bot);
     * **/
    bot.modes.pause('self_defense');
    bot.modes.pause('cowardice');
    let attacked = false;
    let enemy = world.getNearestEntityWhere(bot, entity => mc.isHostile(entity), range);
    while (enemy) {
        await equipHighestAttack(bot);
        if (bot.entity.position.distanceTo(enemy.position) >= 4 && enemy.name !== 'creeper' && enemy.name !== 'phantom') {
            try {
                // RC25: Baritone chase to melee range
                if (!bot.ashfinder.stopped) bot.ashfinder.stop();
                await bot.ashfinder.gotoSmart(new baritoneGoals.GoalNear(enemy.position, 3.5));
            } catch (_err) {/* might error if entity dies, ignore */}
        }
        if (bot.entity.position.distanceTo(enemy.position) <= 2) {
            try {
                // RC25: Baritone retreat from too-close enemy
                if (!bot.ashfinder.stopped) bot.ashfinder.stop();
                await bot.ashfinder.gotoSmart(new baritoneGoals.GoalAvoid(enemy.position, 4, bot));
            } catch (_err) {/* might error if entity dies, ignore */}
        }
        bot.pvp.attack(enemy);
        attacked = true;
        await new Promise(resolve => setTimeout(resolve, 500));
        enemy = world.getNearestEntityWhere(bot, entity => mc.isHostile(entity), range);
        if (bot.interrupt_code) {
            bot.pvp.stop();
            return false;
        }
    }
    bot.pvp.stop();
    if (attacked)
        log(bot, `Successfully defended self.`);
    else
        log(bot, `No enemies nearby to defend self from.`);
    return attacked;
}

// RC24: Timeout helper for Paper server compatibility.
// bot.ashfinder.gotoSmart() and bot.dig() can hang indefinitely on Paper due
// to event handling differences. This races the operation against a timer and
// calls onTimeout (e.g. ashfinder.stop()) to cancel if it exceeds the limit.
function withTimeout(promise, ms, onTimeout) {
    let timer;
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            timer = setTimeout(() => {
                if (onTimeout) onTimeout();
                reject(new Error(`Timed out after ${ms}ms`));
            }, ms);
        })
    ]).finally(() => clearTimeout(timer));
}

export async function collectBlock(bot, blockType, num=1, exclude=null) {
    /**
     * Collect one of the given block type.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} blockType, the type of block to collect.
     * @param {number} num, the number of blocks to collect. Defaults to 1.
     * @param {list} exclude, a list of positions to exclude from the search. Defaults to null.
     * @returns {Promise<boolean>} true if the block was collected, false if the block type was not found.
     * @example
     * await skills.collectBlock(bot, "oak_log");
     **/
    if (num < 1) {
        log(bot, `Invalid number of blocks to collect: ${num}.`);
        return false;
    }
    
    // RC18b: Pause unstuck mode during collection. Mining/navigating to blocks
    // causes the bot to appear "stuck" (moving slowly or pausing while digging),
    // triggering false unstuck interruptions that abort the collection.
    bot.modes.pause('unstuck');
    
    let blocktypes = [blockType];
    if (blockType === 'coal' || blockType === 'diamond' || blockType === 'emerald' || blockType === 'iron' || blockType === 'gold' || blockType === 'lapis_lazuli' || blockType === 'redstone')
        blocktypes.push(blockType+'_ore');
    if (blockType.endsWith('ore'))
        blocktypes.push('deepslate_'+blockType);
    if (blockType === 'dirt')
        blocktypes.push('grass_block');
    if (blockType === 'cobblestone')
        blocktypes.push('stone');
    // RC13: If requesting any log type, also accept other log variants as fallback
    // This prevents bots from starving for wood when oak isn't available but birch/spruce is
    // RC27: Don't eagerly add all log types — only expand AFTER the primary type yields 0 results.
    // Eager expansion causes the bot to target wrong biome logs (e.g., acacia underground)
    // when the requested type (oak) exists on the surface nearby.
    const isLogFallbackEligible = blockType.endsWith('_log');
    let logFallbackExpanded = false;
    const isLiquid = blockType === 'lava' || blockType === 'water';

    let collected = 0;
    let consecutiveFails = 0;
    let interruptRetries = 0;  // RC20: track retries from mode interruptions (e.g., self_defense)
    const MAX_CONSECUTIVE_FAILS = 3; // break out after 3 consecutive failed attempts
    const MAX_INTERRUPT_RETRIES = 8; // RC20: max total retries from combat/mode interruptions

    const movements = new pf.Movements(bot);
    movements.dontMineUnderFallingBlock = false;
    movements.dontCreateFlow = true;

    // Blocks to ignore safety for, usually next to lava/water
    const unsafeBlocks = ['obsidian'];

    // RC13 fix: Log/wood blocks have no gravity and are always safe to break.
    // mineflayer-pathfinder's safeToBreak() is overly conservative for tree logs,
    // causing searchForBlock to find logs that collectBlock then filters out.
    const isNoGravityNaturalBlock = blockType.endsWith('_log') || blockType.endsWith('_wood') ||
        blockType.endsWith('_stem') || blockType === 'mushroom_stem' ||
        blockType.endsWith('leaves') || blockType.endsWith('_planks');

    for (let i=0; i<num; i++) {
        let blocks = world.getNearestBlocksWhere(bot, block => {
            // RC18 FIX: mineflayer's findBlocks has a section palette pre-filter
            // (isBlockInSection) that creates blocks via Block.fromStateId() which
            // sets position=null. We MUST check block name first and return true
            // for palette pre-filter (position=null) to avoid skipping entire sections.
            // Previously: `if (!block.position || !blocktypes.includes(block.name)) return false`
            // caused ALL sections to be skipped because position is always null during palette check.
            if (!blocktypes.includes(block.name)) {
                return false;
            }
            // If position is null, we're in the palette pre-filter — name matched,
            // so tell mineflayer this section might contain our target block.
            if (!block.position) return true;
            
            if (exclude) {
                for (let position of exclude) {
                    if (position && block.position.x === position.x && block.position.y === position.y && block.position.z === position.z) {
                        return false;
                    }
                }
            }
            if (isLiquid) {
                // collect only source blocks
                return block.metadata === 0;
            }
            
            return movements.safeToBreak(block) || unsafeBlocks.includes(block.name) || isNoGravityNaturalBlock;
        }, 128, 1);  // RC17: Increased from 64 to 128 to match searchForBlock range

        if (blocks.length === 0) {
            // RC27: If no primary log type found, expand to all log variants as fallback
            if (isLogFallbackEligible && !logFallbackExpanded) {
                logFallbackExpanded = true;
                const allLogs = ['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log', 'mangrove_log', 'cherry_log'];
                for (const logType of allLogs) {
                    if (!blocktypes.includes(logType)) blocktypes.push(logType);
                }
                console.log(`[RC27] No ${blockType} found, expanding search to all log types`);
                i--;  // retry this iteration with expanded types
                continue;
            }
            if (collected === 0)
                log(bot, `No ${blockType} found within 128 blocks. Gathering system is working fine — this area simply has none. Use !explore(200) to travel far enough to find new resources, then retry. Do NOT use !searchForBlock — explore first to load fresh chunks.`);
            else
                log(bot, `No more ${blockType} nearby to collect. Successfully collected ${collected} so far.`);
            break;
        }
        const block = blocks[0];

        await bot.tool.equipForBlock(block);
        if (isLiquid) {
            const bucket = bot.inventory.items().find(item => item.name === 'bucket');
            if (!bucket) {
                log(bot, `Don't have bucket to harvest ${blockType}.`);
                return false;
            }
            await bot.equip(bucket, 'hand');
        }
        const itemId = bot.heldItem ? bot.heldItem.type : null;
        if (!block.canHarvest(itemId)) {
            log(bot, `Don't have right tools to harvest ${blockType}.`);
            return false;
        }
        try {
            let success = false;
            const invBefore = world.getInventoryCounts(bot);
            if (isLiquid) {
                success = await useToolOnBlock(bot, 'bucket', block);
            }
            else if (mc.mustCollectManually(blockType)) {
                // RC24c: Distance-adaptive timeout for manual collection
                const dist = bot.entity.position.distanceTo(block.position);
                const navTimeout = Math.max(20000, Math.round(dist * 1000) + 10000);
                console.log(`[RC24] Manual-collect ${blockType} at (${block.position.x}, ${block.position.y}, ${block.position.z}) dist=${Math.round(dist)} timeout=${navTimeout}ms`);
                await withTimeout(
                    goToPosition(bot, block.position.x, block.position.y, block.position.z, 2),
                    navTimeout,
                    () => { try { bot.ashfinder.stop(); } catch(_e) {} }
                );
                // RC26: Re-fetch block after navigation (see RC26 comment above)
                const freshBlockManual = bot.blockAt(block.position);
                if (!freshBlockManual || !blocktypes.includes(freshBlockManual.name)) {
                    console.log(`[RC26] Manual block at (${block.position.x}, ${block.position.y}, ${block.position.z}) changed to ${freshBlockManual?.name ?? 'null'}, skipping`);
                    if (!exclude) exclude = [];
                    exclude.push(block.position);
                    i--;  // retry this slot with a different block
                    continue;
                }
                console.log(`[RC24] Digging ${freshBlockManual.name} (manual)`);
                await withTimeout(
                    bot.dig(freshBlockManual),
                    10000,
                    () => { try { bot.stopDigging(); } catch(_e) {} }
                );
                await new Promise(r => setTimeout(r, 300));
                await withTimeout(
                    pickupNearbyItems(bot),
                    8000,
                    () => { try { bot.ashfinder.stop(); } catch(_e) {} }
                );
                // Verify items actually entered inventory
                const invAfter = world.getInventoryCounts(bot);
                const totalBefore = Object.values(invBefore).reduce((a, b) => a + b, 0);
                const totalAfter = Object.values(invAfter).reduce((a, b) => a + b, 0);
                success = totalAfter > totalBefore;
                console.log(`[RC24] Manual-collect result: success=${success}`);
            }
            else {
                // RC24: Manual dig with timeout protection for Paper servers.
                // bot.collectBlock.collect() hangs indefinitely on Paper due to event
                // handling differences. Manual dig also needs timeouts since
                // pathfinder.goto() has no built-in timeout.
                try {
                    // RC24c: Scale nav timeout by distance — bot walks ~4 blocks/sec,
                    // plus overhead for path computation and terrain navigation.
                    const dist = bot.entity.position.distanceTo(block.position);
                    const navTimeout = Math.max(20000, Math.round(dist * 1000) + 10000);
                    console.log(`[RC24] Navigating to ${blockType} at (${block.position.x}, ${block.position.y}, ${block.position.z}) dist=${Math.round(dist)} timeout=${navTimeout}ms`);
                    await withTimeout(
                        goToPosition(bot, block.position.x, block.position.y, block.position.z, 2),
                        navTimeout,
                        () => { try { bot.ashfinder.stop(); } catch(_e) {} }
                    );
                    // RC26: Re-fetch block at position after navigation.
                    // The original block reference can go stale if chunks
                    // unloaded/reloaded during pathfinding, causing bot.dig()
                    // to silently no-op (items 0→0).
                    const freshBlock = bot.blockAt(block.position);
                    if (!freshBlock || !blocktypes.includes(freshBlock.name)) {
                        console.log(`[RC26] Block at (${block.position.x}, ${block.position.y}, ${block.position.z}) changed to ${freshBlock?.name ?? 'null'}, skipping`);
                        if (!exclude) exclude = [];
                        exclude.push(block.position);
                        i--;  // retry this slot with a different block
                        continue;
                    }
                    console.log(`[RC24] Digging ${freshBlock.name}`);
                    await withTimeout(
                        bot.dig(freshBlock),
                        10000,
                        () => { try { bot.stopDigging(); } catch(_e) {} }
                    );
                    console.log(`[RC24] Picking up items`);
                    await new Promise(r => setTimeout(r, 300));
                    await withTimeout(
                        pickupNearbyItems(bot),
                        8000,
                        () => { try { bot.ashfinder.stop(); } catch(_e) {} }
                    );
                    const invAfter = world.getInventoryCounts(bot);
                    const totalBefore = Object.values(invBefore).reduce((a, b) => a + b, 0);
                    const totalAfter = Object.values(invAfter).reduce((a, b) => a + b, 0);
                    success = totalAfter > totalBefore;
                    console.log(`[RC24] Result: success=${success}, items ${totalBefore}→${totalAfter}`);
                } catch (_digErr) {
                    // RC24b: Re-throw "aborted" errors so the outer RC20 handler
                    // can retry them (self_defense/combat interruption recovery)
                    if (_digErr.message && _digErr.message.includes('aborted')) {
                        throw _digErr;
                    }
                    console.log(`[RC24] Failed for ${blockType}: ${_digErr.message}`);
                    try { bot.ashfinder.stop(); } catch(_e) {}
                }
                if (!success) {
                    if (!exclude) exclude = [];
                    exclude.push(block.position);
                }
            }
            if (success) {

                collected++;
                consecutiveFails = 0;
            } else {

                // Exclude this position so we don't keep retrying the same unreachable block
                if (block && block.position) {
                    if (!exclude) exclude = [];
                    exclude.push(block.position);
                }
                consecutiveFails++;
                if (consecutiveFails >= MAX_CONSECUTIVE_FAILS) {
                    log(bot, `Failed to collect ${blockType} ${MAX_CONSECUTIVE_FAILS} times in a row. Blocks may be unreachable. Use !explore(200) to travel to a completely new area, then retry.`);
                    break;
                }
            }
            await autoLight(bot);
        }
        catch (err) {

            if (err.name === 'NoChests') {
                log(bot, `Failed to collect ${blockType}: Inventory full, no place to deposit.`);
                break;
            }
            // RC20: "Digging aborted" comes from self_defense/self_preservation interrupting the dig.
            // Don't count this as a real failure — wait for the mode to finish, then retry the same block.
            else if (err.message && err.message.includes('aborted') && interruptRetries < MAX_INTERRUPT_RETRIES) {
                interruptRetries++;
                console.log(`[RC20] Dig interrupted (retry ${interruptRetries}/${MAX_INTERRUPT_RETRIES}), waiting for mode to finish...`);
                await new Promise(r => setTimeout(r, 2000));  // Wait 2s for combat/mode to finish
                i--;  // Retry the same block on next loop iteration
                continue;
            }
            else {
                log(bot, `Failed to collect ${blockType}: ${err}.`);
                // Exclude this block position so we don't retry it
                if (block && block.position) {
                    if (!exclude) exclude = [];
                    exclude.push(block.position);
                }
                consecutiveFails++;
                if (consecutiveFails >= MAX_CONSECUTIVE_FAILS) {
                    log(bot, `Failed ${MAX_CONSECUTIVE_FAILS} times in a row. Blocks may be unreachable. Use !explore(200) to travel to a completely new area, then retry.`);
                    break;
                }
                continue;
            }
        }
        
        if (bot.interrupt_code)
            break;  
    }
    // RC18b: Resume unstuck mode after collection is done
    bot.modes.unpause('unstuck');
    
    if (collected === 0 && num > 0) {
        log(bot, `Collected 0 ${blockType}. There are no ${blockType} blocks in this area (commands are working correctly). You MUST relocate far away: !explore(200) to reach a completely new area with fresh resources. Do NOT say gathering is broken — it works fine, you just need to travel farther.`);
    } else {
        log(bot, `Collected ${collected} ${blockType}.`);
    }
    return collected > 0;
}

export async function pickupNearbyItems(bot) {
    /**
     * Pick up all nearby items.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @returns {Promise<boolean>} true if the items were picked up, false otherwise.
     * @example
     * await skills.pickupNearbyItems(bot);
     **/
    const distance = 10;
    const getNearestItem = bot => bot.nearestEntity(entity => entity.name === 'item' && bot.entity.position.distanceTo(entity.position) < distance);
    let nearestItem = getNearestItem(bot);
    let pickedUp = 0;
    const maxAttempts = 10;
    let attempts = 0;
    while (nearestItem && attempts < maxAttempts) {
        attempts++;
        const invBefore = bot.inventory.items().reduce((sum, item) => sum + item.count, 0);
        // RC25: Navigate to item without breaking blocks
        const prevBreak = bot.ashfinder.config.breakBlocks;
        bot.ashfinder.config.breakBlocks = false;
        try {
            await goToGoal(bot, new baritoneGoals.GoalNear(nearestItem.position, 1));
        } finally {
            bot.ashfinder.config.breakBlocks = prevBreak;
        }
        // Wait for item pickup with increasing delays
        for (let wait = 0; wait < 5; wait++) {
            await new Promise(resolve => setTimeout(resolve, 200));
            const invAfter = bot.inventory.items().reduce((sum, item) => sum + item.count, 0);
            if (invAfter > invBefore) {
                pickedUp += (invAfter - invBefore);
                break;
            }
        }
        nearestItem = getNearestItem(bot);
    }
    log(bot, `Picked up ${pickedUp} items.`);
    return pickedUp > 0;
}


export async function breakBlockAt(bot, x, y, z) {
    /**
     * Break the block at the given position. Will use the bot's equipped item.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {number} x, the x coordinate of the block to break.
     * @param {number} y, the y coordinate of the block to break.
     * @param {number} z, the z coordinate of the block to break.
     * @returns {Promise<boolean>} true if the block was broken, false otherwise.
     * @example
     * let position = world.getPosition(bot);
     * await skills.breakBlockAt(bot, position.x, position.y - 1, position.x);
     **/
    if (x == null || y == null || z == null) throw new Error('Invalid position to break block at.');
    let block = bot.blockAt(Vec3(x, y, z));
    if (block.name !== 'air' && block.name !== 'water' && block.name !== 'lava') {
        if (bot.modes.isOn('cheat')) {
            if (useDelay) { await new Promise(resolve => setTimeout(resolve, blockPlaceDelay)); }
            let msg = '/setblock ' + Math.floor(x) + ' ' + Math.floor(y) + ' ' + Math.floor(z) + ' air';
            bot.chat(msg);
            log(bot, `Used /setblock to break block at ${x}, ${y}, ${z}.`);
            return true;
        }

        if (bot.entity.position.distanceTo(block.position) > 4.5) {
            // RC25: Navigate to block with baritone (no placing for breakBlockAt)
            const prevPlace = bot.ashfinder.config.placeBlocks;
            bot.ashfinder.config.placeBlocks = false;
            try {
                await goToGoal(bot, new baritoneGoals.GoalNear(block.position, 4));
            } finally {
                bot.ashfinder.config.placeBlocks = prevPlace;
            }
        }
        if (bot.game.gameMode !== 'creative') {
            await bot.tool.equipForBlock(block);
            const itemId = bot.heldItem ? bot.heldItem.type : null;
            if (!block.canHarvest(itemId)) {
                log(bot, `Don't have right tools to break ${block.name}.`);
                return false;
            }
        }
        await bot.dig(block, true);
        log(bot, `Broke ${block.name} at x:${x.toFixed(1)}, y:${y.toFixed(1)}, z:${z.toFixed(1)}.`);
    }
    else {
        log(bot, `Skipping block at x:${x.toFixed(1)}, y:${y.toFixed(1)}, z:${z.toFixed(1)} because it is ${block.name}.`);
        return false;
    }
    return true;
}


export async function placeBlock(bot, blockType, x, y, z, placeOn='bottom', dontCheat=false) {
    /**
     * Place the given block type at the given position. It will build off from any adjacent blocks. Will fail if there is a block in the way or nothing to build off of.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} blockType, the type of block to place, which can be a block or item name.
     * @param {number} x, the x coordinate of the block to place.
     * @param {number} y, the y coordinate of the block to place.
     * @param {number} z, the z coordinate of the block to place.
     * @param {string} placeOn, the preferred side of the block to place on. Can be 'top', 'bottom', 'north', 'south', 'east', 'west', or 'side'. Defaults to bottom. Will place on first available side if not possible.
     * @param {boolean} dontCheat, overrides cheat mode to place the block normally. Defaults to false.
     * @returns {Promise<boolean>} true if the block was placed, false otherwise.
     * @example
     * let p = world.getPosition(bot);
     * await skills.placeBlock(bot, "oak_log", p.x + 2, p.y, p.x);
     * await skills.placeBlock(bot, "torch", p.x + 1, p.y, p.x, 'side');
     **/
    const target_dest = new Vec3(Math.floor(x), Math.floor(y), Math.floor(z));

    if (blockType === 'air') {
        log(bot, `Placing air (removing block) at ${target_dest}.`);
        return await breakBlockAt(bot, x, y, z);
    }

    if (bot.modes.isOn('cheat') && !dontCheat) {
        if (bot.restrict_to_inventory) {
            let block = bot.inventory.items().find(item => item.name === blockType);
            if (!block) {
                log(bot, `Cannot place ${blockType}, you are restricted to your current inventory.`);
                return false;
            }
        }

        // invert the facing direction
        let face = placeOn === 'north' ? 'south' : placeOn === 'south' ? 'north' : placeOn === 'east' ? 'west' : 'east';
        if (blockType.includes('torch') && placeOn !== 'bottom') {
            // insert wall_ before torch
            blockType = blockType.replace('torch', 'wall_torch');
            if (placeOn !== 'side' && placeOn !== 'top') {
                blockType += `[facing=${face}]`;
            }
        }
        if (blockType.includes('button') || blockType === 'lever') {
            if (placeOn === 'top') {
                blockType += `[face=ceiling]`;
            }
            else if (placeOn === 'bottom') {
                blockType += `[face=floor]`;
            }
            else {
                blockType += `[facing=${face}]`;
            }
        }
        if (blockType === 'ladder' || blockType === 'repeater' || blockType === 'comparator') {
            blockType += `[facing=${face}]`;
        }
        if (blockType.includes('stairs')) {
            blockType += `[facing=${face}]`;
        }
        if (useDelay) { await new Promise(resolve => setTimeout(resolve, blockPlaceDelay)); }
        let msg = '/setblock ' + Math.floor(x) + ' ' + Math.floor(y) + ' ' + Math.floor(z) + ' ' + blockType;
        bot.chat(msg);
        if (blockType.includes('door'))
            if (useDelay) { await new Promise(resolve => setTimeout(resolve, blockPlaceDelay)); }
            bot.chat('/setblock ' + Math.floor(x) + ' ' + Math.floor(y+1) + ' ' + Math.floor(z) + ' ' + blockType + '[half=upper]');
        if (blockType.includes('bed'))
            if (useDelay) { await new Promise(resolve => setTimeout(resolve, blockPlaceDelay)); }
            bot.chat('/setblock ' + Math.floor(x) + ' ' + Math.floor(y) + ' ' + Math.floor(z-1) + ' ' + blockType + '[part=head]');
        log(bot, `Used /setblock to place ${blockType} at ${target_dest}.`);
        return true;
    }

    let item_name = blockType;
    if (item_name == "redstone_wire")
        item_name = "redstone";
    else if (item_name === 'water') {
        item_name = 'water_bucket';
    }
    else if (item_name === 'lava') {
        item_name = 'lava_bucket';
    }
    let block_item = bot.inventory.items().find(item => item.name === item_name);
    if (!block_item && bot.game.gameMode === 'creative' && !bot.restrict_to_inventory) {
        await bot.creative.setInventorySlot(36, mc.makeItem(item_name, 1)); // 36 is first hotbar slot
        block_item = bot.inventory.items().find(item => item.name === item_name);
    }
    if (!block_item) {
        log(bot, `Don't have any ${item_name} to place.`);
        return false;
    }

    const targetBlock = bot.blockAt(target_dest);
    if (targetBlock.name === blockType || (targetBlock.name === 'grass_block' && blockType === 'dirt')) {
        log(bot, `${blockType} already at ${targetBlock.position}.`);
        return false;
    }
    const empty_blocks = ['air', 'water', 'lava', 'grass', 'short_grass', 'tall_grass', 'snow', 'dead_bush', 'fern'];
    if (!empty_blocks.includes(targetBlock.name)) {
        log(bot, `${targetBlock.name} in the way at ${targetBlock.position}.`);
        const removed = await breakBlockAt(bot, x, y, z);
        if (!removed) {
            log(bot, `Cannot place ${blockType} at ${targetBlock.position}: block in the way.`);
            return false;
        }
        await new Promise(resolve => setTimeout(resolve, 200)); // wait for block to break
    }
    // get the buildoffblock and facevec based on whichever adjacent block is not empty
    let buildOffBlock = null;
    let faceVec = null;
    const dir_map = {
        'top': Vec3(0, 1, 0),
        'bottom': Vec3(0, -1, 0),
        'north': Vec3(0, 0, -1),
        'south': Vec3(0, 0, 1),
        'east': Vec3(1, 0, 0),
        'west': Vec3(-1, 0, 0),
    };
    let dirs = [];
    if (placeOn === 'side') {
        dirs.push(dir_map['north'], dir_map['south'], dir_map['east'], dir_map['west']);
    }
    else if (dir_map[placeOn] !== undefined) {
        dirs.push(dir_map[placeOn]);
    }
    else {
        dirs.push(dir_map['bottom']);
        log(bot, `Unknown placeOn value "${placeOn}". Defaulting to bottom.`);
    }
    dirs.push(...Object.values(dir_map).filter(d => !dirs.includes(d)));

    for (let d of dirs) {
        const block = bot.blockAt(target_dest.plus(d));
        if (!empty_blocks.includes(block.name)) {
            buildOffBlock = block;
            faceVec = new Vec3(-d.x, -d.y, -d.z); // invert
            break;
        }
    }
    if (!buildOffBlock) {
        log(bot, `Cannot place ${blockType} at ${targetBlock.position}: nothing to place on.`);
        return false;
    }

    const pos = bot.entity.position;
    const pos_above = pos.plus(Vec3(0,1,0));
    const dont_move_for = ['torch', 'redstone_torch', 'redstone', 'lever', 'button', 'rail', 'detector_rail', 
        'powered_rail', 'activator_rail', 'tripwire_hook', 'tripwire', 'water_bucket', 'string'];
    if (!dont_move_for.includes(item_name) && (pos.distanceTo(targetBlock.position) < 1.1 || pos_above.distanceTo(targetBlock.position) < 1.1)) {
        // RC25: Too close — move away using baritone GoalAvoid
        if (!bot.ashfinder.stopped) bot.ashfinder.stop();
        await bot.ashfinder.gotoSmart(new baritoneGoals.GoalAvoid(targetBlock.position, 2, bot));
    }
    if (bot.entity.position.distanceTo(targetBlock.position) > 4.5) {
        // RC25: Too far — navigate closer with baritone
        await goToGoal(bot, new baritoneGoals.GoalNear(targetBlock.position, 4));
    }

    // will throw error if an entity is in the way, and sometimes even if the block was placed
    try {
        if (item_name.includes('bucket')) {
            await useToolOnBlock(bot, item_name, buildOffBlock);
        }
        else {
            await bot.equip(block_item, 'hand');
            await bot.lookAt(buildOffBlock.position.offset(0.5, 0.5, 0.5));
            await bot.placeBlock(buildOffBlock, faceVec);
            log(bot, `Placed ${blockType} at ${target_dest}.`);
            await new Promise(resolve => setTimeout(resolve, 200));
            return true;
        }
    } catch (_err) {
        log(bot, `Failed to place ${blockType} at ${target_dest}.`);
        return false;
    }
}

export async function equip(bot, itemName) {
    /**
     * Equip the given item to the proper body part, like tools or armor.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} itemName, the item or block name to equip.
     * @returns {Promise<boolean>} true if the item was equipped, false otherwise.
     * @example
     * await skills.equip(bot, "iron_pickaxe");
     **/
    if (itemName === 'hand') {
        await bot.unequip('hand');
        log(bot, `Unequipped hand.`);
        return true;
    }
    let item = bot.inventory.slots.find(slot => slot && slot.name === itemName);
    if (!item) {
        if (bot.game.gameMode === "creative") {
            await bot.creative.setInventorySlot(36, mc.makeItem(itemName, 1));
            item = bot.inventory.items().find(item => item.name === itemName);
        }
        else {
            log(bot, `You do not have any ${itemName} to equip.`);
            return false;
        }
    }
    if (itemName.includes('leggings')) {
        await bot.equip(item, 'legs');
    }
    else if (itemName.includes('boots')) {
        await bot.equip(item, 'feet');
    }
    else if (itemName.includes('helmet')) {
        await bot.equip(item, 'head');
    }
    else if (itemName.includes('chestplate') || itemName.includes('elytra')) {
        await bot.equip(item, 'torso');
    }
    else if (itemName.includes('shield')) {
        await bot.equip(item, 'off-hand');
    }
    else {
        await bot.equip(item, 'hand');
    }
    log(bot, `Equipped ${itemName}.`);
    return true;
}

export async function discard(bot, itemName, num=-1) {
    /**
     * Discard the given item.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} itemName, the item or block name to discard.
     * @param {number} num, the number of items to discard. Defaults to -1, which discards all items.
     * @returns {Promise<boolean>} true if the item was discarded, false otherwise.
     * @example
     * await skills.discard(bot, "oak_log");
     **/
    let discarded = 0;
    while (true) {
        let item = bot.inventory.items().find(item => item.name === itemName);
        if (!item) {
            break;
        }
        let to_discard = num === -1 ? item.count : Math.min(num - discarded, item.count);
        await bot.toss(item.type, null, to_discard);
        discarded += to_discard;
        if (num !== -1 && discarded >= num) {
            break;
        }
    }
    if (discarded === 0) {
        log(bot, `You do not have any ${itemName} to discard.`);
        return false;
    }
    log(bot, `Discarded ${discarded} ${itemName}.`);
    return true;
}

export async function putInChest(bot, itemName, num=-1) {
    /**
     * Put the given item in the nearest chest.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} itemName, the item or block name to put in the chest.
     * @param {number} num, the number of items to put in the chest. Defaults to -1, which puts all items.
     * @returns {Promise<boolean>} true if the item was put in the chest, false otherwise.
     * @example
     * await skills.putInChest(bot, "oak_log");
     **/
    let chest = world.getNearestBlock(bot, 'chest', 32);
    if (!chest) {
        log(bot, `Could not find a chest nearby.`);
        return false;
    }
    let item = bot.inventory.items().find(item => item.name === itemName);
    if (!item) {
        log(bot, `You do not have any ${itemName} to put in the chest.`);
        return false;
    }
    let to_put = num === -1 ? item.count : Math.min(num, item.count);
    await goToPosition(bot, chest.position.x, chest.position.y, chest.position.z, 2);
    const chestContainer = await bot.openContainer(chest);
    await chestContainer.deposit(item.type, null, to_put);
    await chestContainer.close();
    log(bot, `Successfully put ${to_put} ${itemName} in the chest.`);
    return true;
}

export async function takeFromChest(bot, itemName, num=-1) {
    /**
     * Take the given item from the nearest chest, potentially from multiple slots.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} itemName, the item or block name to take from the chest.
     * @param {number} num, the number of items to take from the chest. Defaults to -1, which takes all items.
     * @returns {Promise<boolean>} true if the item was taken from the chest, false otherwise.
     * @example
     * await skills.takeFromChest(bot, "oak_log");
     * **/
    let chest = world.getNearestBlock(bot, 'chest', 32);
    if (!chest) {
        log(bot, `Could not find a chest nearby.`);
        return false;
    }
    await goToPosition(bot, chest.position.x, chest.position.y, chest.position.z, 2);
    const chestContainer = await bot.openContainer(chest);
    
    // Find all matching items in the chest
    let matchingItems = chestContainer.containerItems().filter(item => item.name === itemName);
    if (matchingItems.length === 0) {
        log(bot, `Could not find any ${itemName} in the chest.`);
        await chestContainer.close();
        return false;
    }
    
    let totalAvailable = matchingItems.reduce((sum, item) => sum + item.count, 0);
    let remaining = num === -1 ? totalAvailable : Math.min(num, totalAvailable);
    let totalTaken = 0;
    
    // Take items from each slot until we've taken enough or run out
    for (const item of matchingItems) {
        if (remaining <= 0) break;
        
        let toTakeFromSlot = Math.min(remaining, item.count);
        await chestContainer.withdraw(item.type, null, toTakeFromSlot);
        
        totalTaken += toTakeFromSlot;
        remaining -= toTakeFromSlot;
    }
    
    await chestContainer.close();
    log(bot, `Successfully took ${totalTaken} ${itemName} from the chest.`);
    return totalTaken > 0;
}

export async function viewChest(bot) {
    /**
     * View the contents of the nearest chest.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @returns {Promise<boolean>} true if the chest was viewed, false otherwise.
     * @example
     * await skills.viewChest(bot);
     * **/
    let chest = world.getNearestBlock(bot, 'chest', 32);
    if (!chest) {
        log(bot, `Could not find a chest nearby.`);
        return false;
    }
    await goToPosition(bot, chest.position.x, chest.position.y, chest.position.z, 2);
    const chestContainer = await bot.openContainer(chest);
    let items = chestContainer.containerItems();
    if (items.length === 0) {
        log(bot, `The chest is empty.`);
    }
    else {
        log(bot, `The chest contains:`);
        for (let item of items) {
            log(bot, `${item.count} ${item.name}`);
        }
    }
    await chestContainer.close();
    return true;
}

export async function consume(bot, itemName="") {
    /**
     * Eat/drink the given item.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} itemName, the item to eat/drink.
     * @returns {Promise<boolean>} true if the item was eaten, false otherwise.
     * @example
     * await skills.eat(bot, "apple");
     **/
    let item, name;
    if (itemName) {
        item = bot.inventory.items().find(item => item.name === itemName);
        name = itemName;
    }
    if (!item) {
        log(bot, `You do not have any ${name} to eat.`);
        return false;
    }
    await bot.equip(item, 'hand');
    await bot.consume();
    log(bot, `Consumed ${item.name}.`);
    return true;
}


export async function giveToPlayer(bot, itemType, username, num=1) {
    /**
     * Give one of the specified item to the specified player
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} itemType, the name of the item to give.
     * @param {string} username, the username of the player to give the item to.
     * @param {number} num, the number of items to give. Defaults to 1.
     * @returns {Promise<boolean>} true if the item was given, false otherwise.
     * @example
     * await skills.giveToPlayer(bot, "oak_log", "player1");
     **/
    if (bot.username === username) {
        log(bot, `You cannot give items to yourself.`);
        return false;
    }
    let player = bot.players[username].entity;
    if (!player) {
        log(bot, `Could not find ${username}.`);
        return false;
    }
    await goToPlayer(bot, username, 3);
    // if we are 2 below the player
    log(bot, bot.entity.position.y, player.position.y);
    if (bot.entity.position.y < player.position.y - 1) {
        await goToPlayer(bot, username, 1);
    }
    // if we are too close, make some distance
    if (bot.entity.position.distanceTo(player.position) < 2) {
        let too_close = true;
        let start_moving_away = Date.now();
        await moveAwayFromEntity(bot, player, 2);
        while (too_close && !bot.interrupt_code) {
            await new Promise(resolve => setTimeout(resolve, 500));
            too_close = bot.entity.position.distanceTo(player.position) < 5;
            if (too_close) {
                await moveAwayFromEntity(bot, player, 5);
            }
            if (Date.now() - start_moving_away > 3000) {
                break;
            }
        }
        if (too_close) {
            log(bot, `Failed to give ${itemType} to ${username}, too close.`);
            return false;
        }
    }

    await bot.lookAt(player.position);
    if (await discard(bot, itemType, num)) {
        let given = false;
        bot.once('playerCollect', (collector, collected) => {
            console.log(collected.name);
            if (collector.username === username) {
                log(bot, `${username} received ${itemType}.`);
                given = true;
            }
        });
        let start = Date.now();
        while (!given && !bot.interrupt_code) {
            await new Promise(resolve => setTimeout(resolve, 500));
            if (given) {
                return true;
            }
            if (Date.now() - start > 3000) {
                break;
            }
        }
    }
    log(bot, `Failed to give ${itemType} to ${username}, it was never received.`);
    return false;
}

export async function goToGoal(bot, goal) {
    /**
     * RC25b: Navigate to the given goal using Baritone A* pathfinding.
     * Uses bot.ashfinder.gotoSmart() which auto-chooses between direct A*
     * and waypoint navigation based on distance.
     *
     * CRITICAL: gotoSmart() awaits the PathExecutor's completionPromise, but
     * executor.stop() only rejects currentPromise — NOT completionPromise.
     * This means gotoSmart() hangs forever if stopped externally. We MUST wrap
     * it with Promise.race + timeout. After timeout, we check proximity to goal
     * since Paper server position corrections prevent the executor's tight reach
     * check (0.35 blocks) from passing even when the bot is very close.
     *
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {Goal} goal, a baritone goal to navigate to.
     **/

    // Ensure any previous navigation is stopped before starting new one
    if (!bot.ashfinder.stopped) bot.ashfinder.stop();

    // Add glass types to blocksToAvoid so baritone prefers non-destructive paths
    const blocksToAvoid = bot.ashfinder.config.blocksToAvoid || [];
    const glassList = ['glass', 'glass_pane'];
    const addedBlocks = [];
    for (const name of glassList) {
        if (!blocksToAvoid.includes(name)) {
            blocksToAvoid.push(name);
            addedBlocks.push(name);
        }
    }

    // RC25b: Calculate timeout based on distance to goal
    // Paper server's movement corrections make executor reach checks unreliable,
    // so we need our own timeout to prevent infinite hangs.
    let navTimeout = 30000; // default 30s
    try {
        const goalPos = goal.pos || (goal.getPosition ? goal.getPosition() : null);
        if (goalPos) {
            const dist = bot.entity.position.distanceTo(goalPos);
            navTimeout = Math.max(12000, Math.round(dist * 1200) + 5000);
        }
    } catch (_) {}

    const doorCheckInterval = startDoorInterval(bot);
    let timeoutId = null;

    const restoreConfig = () => {
        clearInterval(doorCheckInterval);
        if (timeoutId) clearTimeout(timeoutId);
        for (const name of addedBlocks) {
            const idx = blocksToAvoid.indexOf(name);
            if (idx !== -1) blocksToAvoid.splice(idx, 1);
        }
    };

    // RC25b: Helper — check if bot is close enough to goal to count as success.
    // Paper's position corrections prevent the executor from passing its tight
    // reach threshold (0.35 blocks), but the bot is often within 2-4 blocks.
    // Use generous threshold: goal.distance + 2 (or 5 as fallback).
    const isCloseEnough = () => {
        try {
            const goalPos = goal.pos || (goal.getPosition ? goal.getPosition() : null);
            if (!goalPos) return false;
            const dist = bot.entity.position.distanceTo(goalPos);
            const threshold = (goal.distance || 4) + 2;
            return dist <= threshold;
        } catch (_e) { return false; }
    };

    try {
        // RC25b: Wrap gotoSmart with Promise.race because the PathExecutor's
        // stop() doesn't reject completionPromise, causing gotoSmart to hang forever.
        const result = await Promise.race([
            bot.ashfinder.gotoSmart(goal).catch(err => {
                // RC27: Baritone executor.js:185 can crash with "Cannot read properties
                // of undefined (reading 'length')" when this.path becomes null mid-execution.
                // Catch this here so it doesn't crash the entire process.
                if (err?.message?.includes('Cannot read properties of undefined')) {
                    console.warn(`[RC27] Baritone internal error (non-fatal): ${err.message}`);
                    return { status: 'error', error: err };
                }
                throw err;
            }),
            new Promise((resolve) => {
                timeoutId = setTimeout(() => {
                    try { bot.ashfinder.stop(); } catch (_) {}
                    resolve({ status: 'timeout' });
                }, navTimeout);
            })
        ]);

        restoreConfig();

        // Check proximity first — if close enough, it's success regardless of executor status
        if (isCloseEnough()) return true;

        if (result && result.status === 'success') return true;
        if (result && result.status === 'timeout') {
            throw new Error(`Navigation timed out after ${Math.round(navTimeout/1000)}s`);
        }
        throw new Error(result?.error?.message || 'Navigation failed');
    } catch (err) {
        restoreConfig();
        // Even on error, if we're close enough, consider it success
        if (isCloseEnough()) return true;
        throw err;
    }
}

let _doorInterval = null;
function startDoorInterval(bot) {
    /**
     * Start helper interval that opens nearby doors if the bot is stuck.
     * Phase 1 (1.2s stuck): Try opening doors, fence gates, trapdoors.
     * Phase 2 (8s stuck):   Last resort — temporarily enable breakBlocks so
     *                       Baritone can dig through the obstacle, then disable again.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @returns {number} the interval id.
     **/
    if (_doorInterval) {
        clearInterval(_doorInterval);
    }
    let prev_pos = bot.entity.position.clone();
    let prev_check = Date.now();
    let stuck_time = 0;
    let doorAttempted = false; // track whether we already tried doors this stuck episode

    const DOOR_THRESHOLD  = 1200;  // ms — try doors first
    const BREAK_THRESHOLD = 8000;  // ms — last resort: enable block breaking

    const doorCheckInterval = setInterval(() => {
        const now = Date.now();
        if (bot.entity.position.distanceTo(prev_pos) >= 0.1) {
            stuck_time = 0;
            doorAttempted = false;
            // RC26: If we previously enabled breakBlocks as last resort, disable it again
            if (bot.ashfinder && bot.ashfinder.config.breakBlocks) {
                bot.ashfinder.config.breakBlocks = false;
            }
        } else {
            stuck_time += now - prev_check;
        }

        // Phase 1: Open doors / fence gates / trapdoors
        if (stuck_time > DOOR_THRESHOLD && !doorAttempted) {
            doorAttempted = true;
            // shuffle positions so we're not always opening the same door
            const positions = [
                bot.entity.position.clone(),
                bot.entity.position.offset(0, 0, 1),
                bot.entity.position.offset(0, 0, -1), 
                bot.entity.position.offset(1, 0, 0),
                bot.entity.position.offset(-1, 0, 0),
            ];
            let elevated_positions = positions.map(position => position.offset(0, 1, 0));
            positions.push(...elevated_positions);
            positions.push(bot.entity.position.offset(0, 2, 0)); // above head
            positions.push(bot.entity.position.offset(0, -1, 0)); // below feet
            
            let currentIndex = positions.length;
            while (currentIndex != 0) {
                let randomIndex = Math.floor(Math.random() * currentIndex);
                currentIndex--;
                [positions[currentIndex], positions[randomIndex]] = [
                positions[randomIndex], positions[currentIndex]];
            }
            
            for (let position of positions) {
                let block = bot.blockAt(position);
                if (block && block.name &&
                    !block.name.includes('iron') &&
                    (block.name.includes('door') ||
                     block.name.includes('fence_gate') ||
                     block.name.includes('trapdoor'))) 
                {
                    bot.activateBlock(block);
                    break;
                }
            }
        }

        // Phase 2: Last resort — enable block breaking temporarily
        if (stuck_time > BREAK_THRESHOLD) {
            if (bot.ashfinder && !bot.ashfinder.config.breakBlocks) {
                console.log('[RC26] Stuck >8s after door attempts — enabling breakBlocks as last resort');
                bot.ashfinder.config.breakBlocks = true;
            }
            stuck_time = 0;
            doorAttempted = false;
        }

        prev_pos = bot.entity.position.clone();
        prev_check = now;
    }, 200);
    _doorInterval = doorCheckInterval;
    return doorCheckInterval;
}

export async function goToPosition(bot, x, y, z, min_distance=2) {
    /**
     * Navigate to the given position.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {number} x, the x coordinate to navigate to. If null, the bot's current x coordinate will be used.
     * @param {number} y, the y coordinate to navigate to. If null, the bot's current y coordinate will be used.
     * @param {number} z, the z coordinate to navigate to. If null, the bot's current z coordinate will be used.
     * @param {number} distance, the distance to keep from the position. Defaults to 2.
     * @returns {Promise<boolean>} true if the position was reached, false otherwise.
     * @example
     * let position = world.world.getNearestBlock(bot, "oak_log", 64).position;
     * await skills.goToPosition(bot, position.x, position.y, position.x + 20);
     **/
    if (x == null || y == null || z == null) {
        log(bot, `Missing coordinates, given x:${x} y:${y} z:${z}`);
        return false;
    }
    if (bot.modes.isOn('cheat')) {
        bot.chat('/tp @s ' + x + ' ' + y + ' ' + z);
        log(bot, `Teleported to ${x}, ${y}, ${z}.`);
        return true;
    }
    
    let lastDigTarget = null;
    let unharvestableTicks = 0;
    const checkDigProgress = () => {
        if (bot.targetDigBlock) {
            const targetBlock = bot.targetDigBlock;
            const itemId = bot.heldItem ? bot.heldItem.type : null;
            if (!targetBlock.canHarvest(itemId)) {
                // RC27: Only abort after 2 consecutive checks on the same unharvstable block.
                // Single transient ticks happen when the pathfinder equips tools mid-dig.
                if (lastDigTarget && lastDigTarget.x === targetBlock.position.x &&
                    lastDigTarget.y === targetBlock.position.y &&
                    lastDigTarget.z === targetBlock.position.z) {
                    unharvestableTicks++;
                } else {
                    lastDigTarget = targetBlock.position.clone();
                    unharvestableTicks = 1;
                }
                if (unharvestableTicks >= 2) {
                    log(bot, `Pathfinding stopped: Cannot break ${targetBlock.name} with current tools.`);
                    bot.ashfinder.stop();
                    bot.stopDigging();
                    unharvestableTicks = 0;
                }
            } else {
                unharvestableTicks = 0;
                lastDigTarget = null;
            }
        } else {
            unharvestableTicks = 0;
            lastDigTarget = null;
        }
    };
    
    const progressInterval = setInterval(checkDigProgress, 1000);
    
    try {
        await goToGoal(bot, new baritoneGoals.GoalNear(new Vec3(x, y, z), min_distance));
        clearInterval(progressInterval);
        const distance = bot.entity.position.distanceTo(new Vec3(x, y, z));
        if (distance <= min_distance+1) {
            log(bot, `You have reached at ${x}, ${y}, ${z}.`);
            return true;
        }
        else {
            log(bot, `Unable to reach ${x}, ${y}, ${z}, you are ${Math.round(distance)} blocks away.`);
            return false;
        }
    } catch (err) {
        log(bot, `Pathfinding stopped: ${err.message}.`);
        clearInterval(progressInterval);
        return false;
    }
}

export async function goToNearestBlock(bot, blockType,  min_distance=2, range=64) {
    /**
     * Navigate to the nearest block of the given type.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} blockType, the type of block to navigate to.
     * @param {number} min_distance, the distance to keep from the block. Defaults to 2.
     * @param {number} range, the range to look for the block. Defaults to 64.
     * @returns {Promise<boolean>} true if the block was reached, false otherwise.
     * @example
     * await skills.goToNearestBlock(bot, "oak_log", 64, 2);
     * **/
    const MAX_RANGE = 512;
    if (range > MAX_RANGE) {
        log(bot, `Maximum search range capped at ${MAX_RANGE}. `);
        range = MAX_RANGE;
    }
    let block = null;
    if (blockType === 'water' || blockType === 'lava') {
        let blocks = world.getNearestBlocksWhere(bot, block => block.name === blockType && block.metadata === 0, range, 1);
        if (blocks.length === 0) {
            log(bot, `Could not find any source ${blockType} in ${range} blocks, looking for uncollectable flowing instead...`);
            blocks = world.getNearestBlocksWhere(bot, block => block.name === blockType, range, 1);
        }
        block = blocks[0];
    }
    else {
        block = world.getNearestBlock(bot, blockType, range);
        // RC13: If searching for a log type and none found, try any log type as fallback
        if (!block && blockType.endsWith('_log')) {
            const allLogs = ['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log', 'mangrove_log', 'cherry_log'];
            for (const logType of allLogs) {
                if (logType !== blockType) {
                    block = world.getNearestBlock(bot, logType, range);
                    if (block) {
                        log(bot, `No ${blockType} found, but found ${logType} instead.`);
                        break;
                    }
                }
            }
        }
    }
    if (!block) {
        log(bot, `Could not find any ${blockType} in ${range} blocks.`);
        return false;
    }
    log(bot, `Found ${blockType} at ${block.position}. Navigating...`);
    // RC17: Pause unstuck during navigation to prevent false stuck detection
    bot.modes.pause('unstuck');
    try {
        await goToPosition(bot, block.position.x, block.position.y, block.position.z, min_distance);
    } finally {
        bot.modes.unpause('unstuck');
    }
    return true;
}

export async function goToNearestEntity(bot, entityType, min_distance=2, range=64) {
    /**
     * Navigate to the nearest entity of the given type.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} entityType, the type of entity to navigate to.
     * @param {number} min_distance, the distance to keep from the entity. Defaults to 2.
     * @param {number} range, the range to look for the entity. Defaults to 64.
     * @returns {Promise<boolean>} true if the entity was reached, false otherwise.
     **/
    let entity = world.getNearestEntityWhere(bot, entity => entity.name === entityType, range);
    if (!entity) {
        log(bot, `Could not find any ${entityType} in ${range} blocks.`);
        return false;
    }
    let distance = bot.entity.position.distanceTo(entity.position);
    log(bot, `Found ${entityType} ${distance} blocks away.`);
    await goToPosition(bot, entity.position.x, entity.position.y, entity.position.z, min_distance);
    return true;
}

export async function goToPlayer(bot, username, distance=3) {
    /**
     * Navigate to the given player.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} username, the username of the player to navigate to.
     * @param {number} distance, the goal distance to the player.
     * @returns {Promise<boolean>} true if the player was found, false otherwise.
     * @example
     * await skills.goToPlayer(bot, "player");
     **/
    if (bot.username === username) {
        log(bot, `You are already at ${username}.`);
        return true;
    }
    if (bot.modes.isOn('cheat')) {
        bot.chat('/tp @s ' + username);
        log(bot, `Teleported to ${username}.`);
        return true;
    }

    bot.modes.pause('self_defense');
    bot.modes.pause('cowardice');
    let player = bot.players[username].entity;
    if (!player) {
        log(bot, `Could not find ${username}.`);
        return false;
    }

    distance = Math.max(distance, 0.5);
    // RC25: Baritone — use GoalNear with player's current position instead of GoalFollow
    const goal = new baritoneGoals.GoalNear(player.position, distance);

    await goToGoal(bot, goal);

    log(bot, `You have reached ${username}.`);
}


export async function followPlayer(bot, username, distance=4) {
    /**
     * Follow the given player endlessly. Will not return until the code is manually stopped.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} username, the username of the player to follow.
     * @returns {Promise<boolean>} true if the player was found, false otherwise.
     * @example
     * await skills.followPlayer(bot, "player");
     **/
    let player = bot.players[username].entity;
    if (!player)
        return false;

    // RC25: Baritone followEntity for continuous following
    if (!bot.ashfinder.stopped) bot.ashfinder.stop();
    bot.ashfinder.followEntity(player, { distance: distance, updateInterval: 500 });
    let doorCheckInterval = startDoorInterval(bot);
    log(bot, `You are now actively following player ${username}.`);


    while (!bot.interrupt_code) {
        await new Promise(resolve => setTimeout(resolve, 500));
        // in cheat mode, if the distance is too far, teleport to the player
        const distance_from_player = bot.entity.position.distanceTo(player.position);

        const teleport_distance = 100;
        const ignore_modes_distance = 30; 
        const nearby_distance = distance + 2;

        if (distance_from_player > teleport_distance && bot.modes.isOn('cheat')) {
            // teleport with cheat mode
            await goToPlayer(bot, username);
        }
        else if (distance_from_player > ignore_modes_distance) {
            // these modes slow down the bot, and we want to catch up
            bot.modes.pause('item_collecting');
            bot.modes.pause('hunting');
            bot.modes.pause('torch_placing');
        }
        else if (distance_from_player <= ignore_modes_distance) {
            bot.modes.unpause('item_collecting');
            bot.modes.unpause('hunting');
            bot.modes.unpause('torch_placing');
        }

        if (distance_from_player <= nearby_distance) {
            clearInterval(doorCheckInterval);
            doorCheckInterval = null;
            bot.modes.pause('unstuck');
            bot.modes.pause('elbow_room');
        }
        else {
            if (!doorCheckInterval) {
                doorCheckInterval = startDoorInterval(bot);
            }
            bot.modes.unpause('unstuck');
            bot.modes.unpause('elbow_room');
        }
    }
    bot.ashfinder.stopFollowing(); // RC25: stop baritone entity following
    clearInterval(doorCheckInterval);
    return true;
}


export async function moveAway(bot, distance) {
    /**
     * Move away from current position in any direction.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {number} distance, the distance to move away.
     * @returns {Promise<boolean>} true if the bot moved away, false otherwise.
     * @example
     * await skills.moveAway(bot, 8);
     **/
    const pos = bot.entity.position;
    // RC25: Baritone GoalAvoid moves away from a position
    let avoidGoal = new baritoneGoals.GoalAvoid(pos, distance, bot);

    if (bot.modes.isOn('cheat')) {
        if (!bot.ashfinder.stopped) bot.ashfinder.stop();
        const pathResult = await bot.ashfinder.generatePath(avoidGoal);
        if (pathResult && pathResult.path && pathResult.path.length > 0) {
            let last_move = pathResult.path[pathResult.path.length-1];
            let x = Math.floor(last_move.x);
            let y = Math.floor(last_move.y);
            let z = Math.floor(last_move.z);
            bot.chat('/tp @s ' + x + ' ' + y + ' ' + z);
            return true;
        }
    }

    await goToGoal(bot, avoidGoal);
    let new_pos = bot.entity.position;
    log(bot, `Moved away from ${pos.floored()} to ${new_pos.floored()}.`);
    return true;
}

export async function moveAwayFromEntity(bot, entity, distance=16) {
    /**
     * Move away from the given entity.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {Entity} entity, the entity to move away from.
     * @param {number} distance, the distance to move away.
     * @returns {Promise<boolean>} true if the bot moved away, false otherwise.
     **/
    // RC25: Baritone GoalAvoid to move away from entity
    let avoidGoal = new baritoneGoals.GoalAvoid(entity.position, distance, bot);
    await goToGoal(bot, avoidGoal);
}


export async function explore(bot, distance=40) {
    /**
     * Move to a random position to explore new terrain and find fresh resources.
     * Uses multi-hop navigation for distances > 60 blocks to avoid pathfinder timeouts.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {number} distance, the approximate distance to explore. Defaults to 40.
     * @returns {Promise<boolean>} true if exploration succeeded, false otherwise.
     * @example
     * await skills.explore(bot, 200);
     **/
    const startPos = bot.entity.position.clone();
    let angle = Math.random() * 2 * Math.PI;  // RC17b: let (mutable) — water avoidance changes direction
    const HOP_SIZE = 50; // max distance per pathfinding hop
    const numHops = Math.max(1, Math.ceil(distance / HOP_SIZE));
    
    // Pause unstuck mode during multi-hop — pathfinding between hops can trigger false stuck detection
    if (numHops > 1) bot.modes.pause('unstuck');
    
    log(bot, `Exploring ${distance} blocks (${numHops} hops)...`);
    
    let totalMoved = 0;
    let consecutiveFails = 0;
    
    for (let hop = 0; hop < numHops; hop++) {
        if (bot.interrupt_code) break;
        
        const currentPos = bot.entity.position;
        const hopDist = Math.min(HOP_SIZE, distance - totalMoved);
        
        // Add slight random angle variation per hop to avoid obstacles
        const hopAngle = angle + (Math.random() - 0.5) * 0.4;
        const tx = Math.floor(currentPos.x + hopDist * Math.cos(hopAngle));
        const tz = Math.floor(currentPos.z + hopDist * Math.sin(hopAngle));
        
        try {
            await goToPosition(bot, tx, currentPos.y, tz, 3);
            const moved = currentPos.distanceTo(bot.entity.position);
            totalMoved += moved;
            consecutiveFails = 0;
            
            // RC17b: Water/ocean detection — if we dropped below sea level (y<=62)
            // or are standing on water, the path is heading toward ocean. Change direction.
            // Note: y=63 is sea level and many valid forest areas exist there, so only trigger at y<=62.
            const postHopY = bot.entity.position.y;
            const feetBlock = bot.blockAt(bot.entity.position.offset(0, -0.5, 0));
            const isNearWater = (feetBlock && (feetBlock.name === 'water' || feetBlock.name === 'kelp' || feetBlock.name === 'seagrass')) || postHopY <= 62;
            
            if (isNearWater && hop < numHops - 1) {
                log(bot, `Heading toward water (y=${Math.round(postHopY)}), changing direction...`);
                // Reverse + perpendicular to move away from water
                angle = angle + Math.PI * 0.75 + (Math.random() - 0.5) * 0.5;
            }
            
            if (moved < 5 && hop > 0) {
                // Barely moved — try a perpendicular direction
                const perpAngle = angle + (Math.random() > 0.5 ? Math.PI/2 : -Math.PI/2);
                const px = Math.floor(bot.entity.position.x + hopDist * Math.cos(perpAngle));
                const pz = Math.floor(bot.entity.position.z + hopDist * Math.sin(perpAngle));
                log(bot, `Path blocked, trying perpendicular direction...`);
                try {
                    await goToPosition(bot, px, bot.entity.position.y, pz, 3);
                    totalMoved += bot.entity.position.distanceTo(currentPos);
                } catch (_e) { /* continue with next hop */ }
            }
        } catch (_err) {
            consecutiveFails++;
            if (consecutiveFails >= 2) {
                log(bot, `Exploration stuck after ${Math.round(totalMoved)} blocks. Move to a new area far away and try a different direction.`);
                break;
            }
            // Try perpendicular direction on failure
            const perpAngle = angle + (Math.random() > 0.5 ? Math.PI/2 : -Math.PI/2);
            const px = Math.floor(currentPos.x + hopDist * Math.cos(perpAngle));
            const pz = Math.floor(currentPos.z + hopDist * Math.sin(perpAngle));
            try {
                await goToPosition(bot, px, currentPos.y, pz, 3);
                totalMoved += currentPos.distanceTo(bot.entity.position);
                consecutiveFails = 0;
            } catch (_e2) { /* will try next hop */ }
        }
    }
    
    let finalPos = bot.entity.position;
    let directDistance = startPos.distanceTo(finalPos);
    
    // RC17: Smart explore — check if we landed near resources (any log type).
    // If not, auto-retry in different directions before returning to the LLM.
    const LOG_TYPES = ['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log', 'mangrove_log', 'cherry_log'];
    const MAX_DIRECTION_RETRIES = 2;
    
    for (let retry = 0; retry < MAX_DIRECTION_RETRIES; retry++) {
        if (bot.interrupt_code) break;
        
        // Check for any log blocks within 128 blocks
        let hasLogs = false;
        for (const logType of LOG_TYPES) {
            const logBlock = world.getNearestBlock(bot, logType, 128);
            if (logBlock) {
                hasLogs = true;
                break;
            }
        }
        
        if (hasLogs) break; // Found logs nearby, good landing spot
        
        // Also check if we're in water (bad landing)
        const feetBlock = bot.blockAt(bot.entity.position.offset(0, -1, 0));
        const isInWater = feetBlock && (feetBlock.name === 'water' || feetBlock.name === 'ice' || feetBlock.name === 'blue_ice');
        
        if (!hasLogs) {
            log(bot, `No trees in this area${isInWater ? ' (landed in water)' : ''}. Trying a different direction (attempt ${retry + 1}/${MAX_DIRECTION_RETRIES})...`);
            
            // Pick a direction roughly perpendicular to our original angle
            const retryAngle = angle + Math.PI / 2 + (retry * Math.PI / 3) + (Math.random() - 0.5) * 0.5;
            const retryDist = Math.min(100, distance);
            const retryHops = Math.max(1, Math.ceil(retryDist / HOP_SIZE));
            
            for (let hop = 0; hop < retryHops; hop++) {
                if (bot.interrupt_code) break;
                const cp = bot.entity.position;
                const hd = Math.min(HOP_SIZE, retryDist - (hop * HOP_SIZE));
                const tx = Math.floor(cp.x + hd * Math.cos(retryAngle));
                const tz = Math.floor(cp.z + hd * Math.sin(retryAngle));
                try {
                    await goToPosition(bot, tx, cp.y, tz, 3);
                } catch (_e) { break; }
            }
            
            finalPos = bot.entity.position;
            directDistance = startPos.distanceTo(finalPos);
        }
    }
    
    // Resume unstuck mode
    if (numHops > 1) bot.modes.unpause('unstuck');
    
    log(bot, `Explored ${Math.round(directDistance)} blocks to (${Math.floor(finalPos.x)}, ${Math.floor(finalPos.y)}, ${Math.floor(finalPos.z)}). New chunks loaded — try gathering here.`);
    return directDistance > 10;
}

export async function avoidEnemies(bot, distance=16) {
    /**
     * Move a given distance away from all nearby enemy mobs.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {number} distance, the distance to move away.
     * @returns {Promise<boolean>} true if the bot moved away, false otherwise.
     * @example
     * await skills.avoidEnemies(bot, 8);
     **/
    bot.modes.pause('self_preservation'); // prevents damage-on-low-health from interrupting the bot
    let enemy = world.getNearestEntityWhere(bot, entity => mc.isHostile(entity), distance);
    while (enemy) {
        // RC25: Baritone GoalAvoid to flee from enemy
        const avoidGoal = new baritoneGoals.GoalAvoid(enemy.position, distance + 1, bot);
        if (!bot.ashfinder.stopped) bot.ashfinder.stop();
        try {
            await bot.ashfinder.gotoSmart(avoidGoal);
        } catch (_e) { /* best-effort flee */ }
        await new Promise(resolve => setTimeout(resolve, 500));
        enemy = world.getNearestEntityWhere(bot, entity => mc.isHostile(entity), distance);
        if (bot.interrupt_code) {
            break;
        }
        if (enemy && bot.entity.position.distanceTo(enemy.position) < 3) {
            await attackEntity(bot, enemy, false);
        }
    }
    bot.ashfinder.stop();
    log(bot, `Moved ${distance} away from enemies.`);
    return true;
}

export async function stay(bot, seconds=30) {
    /**
     * Stay in the current position until interrupted. Disables all modes.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {number} seconds, the number of seconds to stay. Defaults to 30. -1 for indefinite.
     * @returns {Promise<boolean>} true if the bot stayed, false otherwise.
     * @example
     * await skills.stay(bot);
     **/
    bot.modes.pause('self_preservation');
    bot.modes.pause('unstuck');
    bot.modes.pause('cowardice');
    bot.modes.pause('self_defense');
    bot.modes.pause('hunting');
    bot.modes.pause('torch_placing');
    bot.modes.pause('item_collecting');
    let start = Date.now();
    while (!bot.interrupt_code && (seconds === -1 || Date.now() - start < seconds*1000)) {
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    log(bot, `Stayed for ${(Date.now() - start)/1000} seconds.`);
    return true;
}

export async function useDoor(bot, door_pos=null) {
    /**
     * Use the door at the given position.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {Vec3} door_pos, the position of the door to use. If null, the nearest door will be used.
     * @returns {Promise<boolean>} true if the door was used, false otherwise.
     * @example
     * let door = world.getNearestBlock(bot, "oak_door", 16).position;
     * await skills.useDoor(bot, door);
     **/
    if (!door_pos) {
        for (let door_type of ['oak_door', 'spruce_door', 'birch_door', 'jungle_door', 'acacia_door', 'dark_oak_door',
                               'mangrove_door', 'cherry_door', 'bamboo_door', 'crimson_door', 'warped_door']) {
            door_pos = world.getNearestBlock(bot, door_type, 16).position;
            if (door_pos) break;
        }
    } else {
        door_pos = Vec3(door_pos.x, door_pos.y, door_pos.z);
    }
    if (!door_pos) {
        log(bot, `Could not find a door to use.`);
        return false;
    }

    try {
        // RC25: Baritone gotoSmart replaces pathfinder.setGoal + isMoving poll
        if (!bot.ashfinder.stopped) bot.ashfinder.stop();
        await bot.ashfinder.gotoSmart(new baritoneGoals.GoalNear(door_pos, 1));
        
        let door_block = bot.blockAt(door_pos);
        if (!door_block) {
            log(bot, `Door block disappeared at ${door_pos}.`);
            return false;
        }
        
        await bot.lookAt(door_pos.offset(0.5, 0.5, 0.5));
        
        // Toggle door state if it exists
        if (door_block._properties && !door_block._properties.open)
            await bot.activateBlock(door_block);
        else if (!door_block._properties)
            await bot.activateBlock(door_block);
        
        // Wait and move through
        await new Promise((resolve) => setTimeout(resolve, 300));
        bot.setControlState("forward", true);
        await new Promise((resolve) => setTimeout(resolve, 800));
        bot.setControlState("forward", false);
        
        // Close door if it's still open
        door_block = bot.blockAt(door_pos);
        if (door_block && door_block._properties && door_block._properties.open) {
            await bot.activateBlock(door_block);
        }

        log(bot, `Used door at ${door_pos}.`);
        return true;
    } catch (err) {
        log(bot, `Error using door: ${err.message}.`);
        return false;
    }
}

export async function goToBed(bot) {
    /**
     * Sleep in the nearest bed.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @returns {Promise<boolean>} true if the bed was found, false otherwise.
     * @example
     * await skills.goToBed(bot);
     **/
    const beds = bot.findBlocks({
        matching: (block) => {
            return block.name.includes('bed');
        },
        maxDistance: 32,
        count: 1
    });
    if (beds.length === 0) {
        log(bot, `Could not find a bed to sleep in.`);
        return false;
    }
    let loc = beds[0];
    await goToPosition(bot, loc.x, loc.y, loc.z);
    const bed = bot.blockAt(loc);
    if (!bed) {
        log(bot, `Could not find a bed block at location.`);
        return false;
    }
    let slept = false;
    try {
        await bot.sleep(bed);
        slept = true;
    } catch (err) {
        // Sometimes the located bed is the wrong half. Try adjacent blocks.
        const offsets = [
            { x: 1, y: 0, z: 0 },
            { x: -1, y: 0, z: 0 },
            { x: 0, y: 0, z: 1 },
            { x: 0, y: 0, z: -1 }
        ];
        for (const offset of offsets) {
            const otherPos = bed.position.offset(offset.x, offset.y, offset.z);
            const otherBed = bot.blockAt(otherPos);
            if (otherBed && otherBed.name === bed.name) {
                try {
                    await bot.sleep(otherBed);
                    slept = true;
                    break;
                } catch (_e) {
                    // continue trying other halves
                }
            }
        }
        if (!slept) {
            log(bot, `Could not sleep in bed: ${err?.message ?? 'unknown error'}`);
            return false;
        }
    }
    log(bot, `You are in bed.`);
    bot.modes.pause('unstuck');
    while (bot.isSleeping) {
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    log(bot, `You have woken up.`);
    return true;
}

export async function tillAndSow(bot, x, y, z, seedType=null) {
    /**
     * Till the ground at the given position and plant the given seed type.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {number} x, the x coordinate to till.
     * @param {number} y, the y coordinate to till.
     * @param {number} z, the z coordinate to till.
     * @param {string} plantType, the type of plant to plant. Defaults to none, which will only till the ground.
     * @returns {Promise<boolean>} true if the ground was tilled, false otherwise.
     * @example
     * let position = world.getPosition(bot);
     * await skills.tillAndSow(bot, position.x, position.y - 1, position.x, "wheat");
     **/
    let pos = new Vec3(Math.floor(x), Math.floor(y), Math.floor(z));
    let block = bot.blockAt(pos);
    log(bot, `Planting ${seedType} at x:${x.toFixed(1)}, y:${y.toFixed(1)}, z:${z.toFixed(1)}.`);

    if (bot.modes.isOn('cheat')) {
        let to_remove = ['_seed', '_seeds'];
        for (let remove of to_remove) {
            if (seedType.endsWith(remove)) {
                seedType = seedType.replace(remove, '');
            }
        }
        await placeBlock(bot, 'farmland', x, y, z);
        await placeBlock(bot, seedType, x, y+1, z);
        return true;
    }

    if (block.name !== 'grass_block' && block.name !== 'dirt' && block.name !== 'farmland') {
        log(bot, `Cannot till ${block.name}, must be grass_block or dirt.`);
        return false;
    }
    let above = bot.blockAt(new Vec3(x, y+1, z));
    if (above.name !== 'air') {
        if (block.name === 'farmland') {
            log(bot, `Land is already farmed with ${above.name}.`);
            return true;
        }
        let broken = await breakBlockAt(bot, x, y+1, z);
        if (!broken) {
            log(bot, `Cannot cannot break above block to till.`);
            return false;
        }
    }
    // if distance is too far, move to the block
    if (bot.entity.position.distanceTo(block.position) > 4.5) {
        let pos = block.position;
        // RC25: Baritone GoalNear
        await goToGoal(bot, new baritoneGoals.GoalNear(pos, 4));
    }
    if (block.name !== 'farmland') {
        let hoe = bot.inventory.items().find(item => item.name.includes('hoe'));
        let to_equip = hoe?.name || 'diamond_hoe';
        if (!await equip(bot, to_equip)) {
            log(bot, `Cannot till, no hoes.`);
            return false;
        }
        await bot.activateBlock(block);
        log(bot, `Tilled block x:${x.toFixed(1)}, y:${y.toFixed(1)}, z:${z.toFixed(1)}.`);
    }
    
    if (seedType) {
        if (seedType.endsWith('seed') && !seedType.endsWith('seeds'))
            seedType += 's'; // fixes common mistake
        let equipped_seeds = await equip(bot, seedType);
        if (!equipped_seeds) {
            log(bot, `No ${seedType} to plant.`);
            return false;
        }

        await bot.activateBlock(block);
        log(bot, `Planted ${seedType} at x:${x.toFixed(1)}, y:${y.toFixed(1)}, z:${z.toFixed(1)}.`);
    }
    return true;
}

export async function activateNearestBlock(bot, type) {
    /**
     * Activate the nearest block of the given type.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} type, the type of block to activate.
     * @returns {Promise<boolean>} true if the block was activated, false otherwise.
     * @example
     * await skills.activateNearestBlock(bot, "lever");
     * **/
    let block = world.getNearestBlock(bot, type, 16);
    if (!block) {
        log(bot, `Could not find any ${type} to activate.`);
        return false;
    }
    if (bot.entity.position.distanceTo(block.position) > 4.5) {
        let pos = block.position;
        // RC25: Baritone GoalNear
        await goToGoal(bot, new baritoneGoals.GoalNear(pos, 4));
    }
    await bot.activateBlock(block);
    log(bot, `Activated ${type} at x:${block.position.x.toFixed(1)}, y:${block.position.y.toFixed(1)}, z:${block.position.z.toFixed(1)}.`);
    return true;
}

/**
 * Helper function to find and navigate to a villager for trading
 * @param {MinecraftBot} bot - reference to the minecraft bot
 * @param {number} id - the entity id of the villager
 * @returns {Promise<Object|null>} the villager entity if found and reachable, null otherwise
 */
async function findAndGoToVillager(bot, id) {
    id = id+"";
    const entity = bot.entities[id];
    
    if (!entity) {
        log(bot, `Cannot find villager with id ${id}`);
        let entities = world.getNearbyEntities(bot, 16);
        let villager_list = "Available villagers:\n";
        for (let entity of entities) {
            if (entity.name === 'villager') {
                if (entity.metadata && entity.metadata[16] === 1) {
                    villager_list += `${entity.id}: baby villager\n`;
                } else {
                    const profession = world.getVillagerProfession(entity);
                    villager_list += `${entity.id}: ${profession}\n`;
                }
            }
        }
        if (villager_list === "Available villagers:\n") {
            log(bot, "No villagers found nearby.");
            return null;
        }
        log(bot, villager_list);
        return null;
    }
    
    if (entity.entityType !== bot.registry.entitiesByName.villager.id) {
        log(bot, 'Entity is not a villager');
        return null;
    }
    
    if (entity.metadata && entity.metadata[16] === 1) {
        log(bot, 'This is either a baby villager or a villager with no job - neither can trade');
        return null;
    }
    
    const distance = bot.entity.position.distanceTo(entity.position);
    if (distance > 4) {
        log(bot, `Villager is ${distance.toFixed(1)} blocks away, moving closer...`);
        try {
            bot.modes.pause('unstuck');
            // RC25: Baritone GoalNear replaces GoalFollow for villager approach
            const goal = new baritoneGoals.GoalNear(entity.position, 2);
            await goToGoal(bot, goal);
            
            
            log(bot, 'Successfully reached villager');
        } catch (err) {
            log(bot, 'Failed to reach villager - pathfinding error or villager moved');
            console.log(err);
            return null;
        } finally {
            bot.modes.unpause('unstuck');
        }
    }
    
    return entity;
}

/**
 * Show available trades for a specified villager
 * @param {MinecraftBot} bot - reference to the minecraft bot
 * @param {number} id - the entity id of the villager to show trades for
 * @returns {Promise<boolean>} true if trades were shown successfully, false otherwise
 * @example
 * await skills.showVillagerTrades(bot, "123");
 */
export async function showVillagerTrades(bot, id) {
    const villagerEntity = await findAndGoToVillager(bot, id);
    if (!villagerEntity) {
        return false;
    }
    
    try {
        const villager = await bot.openVillager(villagerEntity);
        
        if (!villager.trades || villager.trades.length === 0) {
            log(bot, 'This villager has no trades available - might be sleeping, a baby, or jobless');
            villager.close();
            return false;
        }
        
        log(bot, `Villager has ${villager.trades.length} available trades:`);
        stringifyTrades(bot, villager.trades).forEach((trade, i) => {
            const tradeInfo = `${i + 1}: ${trade}`;
            console.log(tradeInfo);
            log(bot, tradeInfo);
        });
        
        villager.close();
        return true;
    } catch (err) {
        log(bot, 'Failed to open villager trading interface - they might be sleeping, a baby, or jobless');
        console.log('Villager trading error:', err.message);
        return false;
    }
}

/**
 * Trade with a specified villager
 * @param {MinecraftBot} bot - reference to the minecraft bot
 * @param {number} id - the entity id of the villager to trade with
 * @param {number} index - the index (1-based) of the trade to execute
 * @param {number} count - how many times to execute the trade (optional)
 * @returns {Promise<boolean>} true if trade was successful, false otherwise
 * @example
 * await skills.tradeWithVillager(bot, "123", "1", "2");
 */
export async function tradeWithVillager(bot, id, index, count) {
    const villagerEntity = await findAndGoToVillager(bot, id);
    if (!villagerEntity) {
        return false;
    }
    
    try {
        const villager = await bot.openVillager(villagerEntity);
        
        if (!villager.trades || villager.trades.length === 0) {
            log(bot, 'This villager has no trades available - might be sleeping, a baby, or jobless');
            villager.close();
            return false;
        }
        
        const tradeIndex = parseInt(index) - 1; // Convert to 0-based index
        const trade = villager.trades[tradeIndex];
        
        if (!trade) {
            log(bot, `Trade ${index} not found. This villager has ${villager.trades.length} trades available.`);
            villager.close();
            return false;
        }
        
        if (trade.disabled) {
            log(bot, `Trade ${index} is currently disabled`);
            villager.close();
            return false;
        }

        const item_2 = trade.inputItem2 ? stringifyItem(bot, trade.inputItem2)+' ' : '';
        log(bot, `Trading ${stringifyItem(bot, trade.inputItem1)} ${item_2}for ${stringifyItem(bot, trade.outputItem)}...`);
        
        const maxPossibleTrades = trade.maximumNbTradeUses - trade.nbTradeUses;
        const requestedCount = count;
        const actualCount = Math.min(requestedCount, maxPossibleTrades);
        
        if (actualCount <= 0) {
            log(bot, `Trade ${index} has been used to its maximum limit`);
            villager.close();
            return false;
        }
        
        if (!hasResources(villager.slots, trade, actualCount)) {
            log(bot, `Don't have enough resources to execute trade ${index} ${actualCount} time(s)`);
            villager.close();
            return false;
        }
        
        log(bot, `Executing trade ${index} ${actualCount} time(s)...`);
        
        try {
            await bot.trade(villager, tradeIndex, actualCount);
            log(bot, `Successfully traded ${actualCount} time(s)`);
            villager.close();
            return true;
        } catch (tradeErr) {
            log(bot, 'An error occurred while trying to execute the trade');
            console.log('Trade execution error:', tradeErr.message);
            villager.close();
            return false;
        }
    } catch (err) {
        log(bot, 'Failed to open villager trading interface');
        console.log('Villager interface error:', err.message);
        return false;
    }
}

function hasResources(window, trade, count) {
    const first = enough(trade.inputItem1, count);
    const second = !trade.inputItem2 || enough(trade.inputItem2, count);
    return first && second;

    function enough(item, count) {
        let c = 0;
        window.forEach((element) => {
            if (element && element.type === item.type && element.metadata === item.metadata) {
                c += element.count;
            }
        });
        return c >= item.count * count;
    }
}

function stringifyTrades(bot, trades) {
    return trades.map((trade) => {
        let text = stringifyItem(bot, trade.inputItem1);
        if (trade.inputItem2) text += ` & ${stringifyItem(bot, trade.inputItem2)}`;
        if (trade.disabled) text += ' x '; else text += ' » ';
        text += stringifyItem(bot, trade.outputItem);
        return `(${trade.nbTradeUses}/${trade.maximumNbTradeUses}) ${text}`;
    });
}

function stringifyItem(bot, item) {
    if (!item) return 'nothing';
    let text = `${item.count} ${item.displayName}`;
    if (item.nbt && item.nbt.value) {
        const ench = item.nbt.value.ench;
        const StoredEnchantments = item.nbt.value.StoredEnchantments;
        const Potion = item.nbt.value.Potion;
        const display = item.nbt.value.display;

        if (Potion) text += ` of ${Potion.value.replace(/_/g, ' ').split(':')[1] || 'unknown type'}`;
        if (display) text += ` named ${display.value.Name.value}`;
        if (ench || StoredEnchantments) {
            text += ` enchanted with ${(ench || StoredEnchantments).value.value.map((e) => {
                const lvl = e.lvl.value;
                const id = e.id.value;
                return bot.registry.enchantments[id].displayName + ' ' + lvl;
            }).join(' ')}`;
        }
    }
    return text;
}

export async function digDown(bot, distance = 10) {
    /**
     * Digs down a specified distance. Will stop if it reaches lava, water, or a fall of >=4 blocks below the bot.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {int} distance, distance to dig down.
     * @returns {Promise<boolean>} true if successfully dug all the way down.
     * @example
     * await skills.digDown(bot, 10);
     **/

    let start_block_pos = bot.blockAt(bot.entity.position).position;
    for (let i = 1; i <= distance; i++) {
        const targetBlock = bot.blockAt(start_block_pos.offset(0, -i, 0));
        let belowBlock = bot.blockAt(start_block_pos.offset(0, -i-1, 0));

        if (!targetBlock || !belowBlock) {
            log(bot, `Dug down ${i-1} blocks, but reached the end of the world.`);
            return true;
        }

        // Check for lava, water
        if (targetBlock.name === 'lava' || targetBlock.name === 'water' || 
            belowBlock.name === 'lava' || belowBlock.name === 'water') {
            log(bot, `Dug down ${i-1} blocks, but reached ${belowBlock ? belowBlock.name : '(lava/water)'}`);
            return false;
        }

        const MAX_FALL_BLOCKS = 2;
        let num_fall_blocks = 0;
        for (let j = 0; j <= MAX_FALL_BLOCKS; j++) {
            if (!belowBlock || (belowBlock.name !== 'air' && belowBlock.name !== 'cave_air')) {
                break;
            }
            num_fall_blocks++;
            belowBlock = bot.blockAt(belowBlock.position.offset(0, -1, 0));
        }
        if (num_fall_blocks > MAX_FALL_BLOCKS) {
            log(bot, `Dug down ${i-1} blocks, but reached a drop below the next block.`);
            return false;
        }

        if (targetBlock.name === 'air' || targetBlock.name === 'cave_air') {
            log(bot, 'Skipping air block');
            console.log(targetBlock.position);
            continue;
        }

        let dug = await breakBlockAt(bot, targetBlock.position.x, targetBlock.position.y, targetBlock.position.z);
        if (!dug) {
            log(bot, 'Failed to dig block at position:' + targetBlock.position);
            return false;
        }
    }
    log(bot, `Dug down ${distance} blocks.`);
    return true;
}

export async function goToSurface(bot) {
    /**
     * Navigate to the surface (highest non-air block at current x,z).
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @returns {Promise<boolean>} true if the surface was reached, false otherwise.
     **/
    const pos = bot.entity.position;
    for (let y = 360; y > -64; y--) { // probably not the best way to find the surface but it works
        const block = bot.blockAt(new Vec3(pos.x, y, pos.z));
        if (!block || block.name === 'air' || block.name === 'cave_air') {
            continue;
        }
        await goToPosition(bot, block.position.x, block.position.y + 1, block.position.z, 0); // this will probably work most of the time but a custom mining and towering up implementation could be added if needed
        log(bot, `Going to the surface at y=${y+1}.`);
        return true;
    }
    return false;
}

export async function useToolOn(bot, toolName, targetName) {
    /**
     * Equip a tool and use it on the nearest target.
     * @param {MinecraftBot} bot
     * @param {string} toolName - item name of the tool to equip, or "hand" for no tool.
     * @param {string} targetName - entity type, block type, or "nothing" for no target
     * @returns {Promise<boolean>} true if action succeeded
     */
    if (!bot.inventory.slots.find(slot => slot && slot.name === toolName) && !bot.game.gameMode === 'creative') {
        log(bot, `You do not have any ${toolName} to use.`);
        return false;
    }

    targetName = targetName.toLowerCase();
    if (targetName === 'nothing') {
        const equipped = await equip(bot, toolName);
        if (!equipped) {
            return false;
        }
        await bot.activateItem();
        log(bot, `Used ${toolName}.`);
    } else if (world.isEntityType(targetName)) {
        const entity = world.getNearestEntityWhere(bot, e => e.name === targetName, 64);
        if (!entity) {
            log(bot, `Could not find any ${targetName}.`);
            return false;
        }
        await goToPosition(bot, entity.position.x, entity.position.y, entity.position.z);
        if (toolName === 'hand') {
            await bot.unequip('hand');
        }
        else {
            const equipped = await equip(bot, toolName);
            if (!equipped) return false;
        }
        await bot.useOn(entity);
        log(bot, `Used ${toolName} on ${targetName}.`);
    } else {
        let block = null;
        if (targetName === 'water' || targetName === 'lava') {
            // we want to get liquid source blocks, not flowing blocks
            // so search for blocks with metadata 0 (not flowing)
            let blocks = world.getNearestBlocksWhere(bot, block => block.name === targetName && block.metadata === 0, 64, 1);
            if (blocks.length === 0) {
                log(bot, `Could not find any source ${targetName}.`);
                return false;
            }
            block = blocks[0];
        }
        else {
            block = world.getNearestBlock(bot, targetName, 64);
        }
        if (!block) {
            log(bot, `Could not find any ${targetName}.`);
            return false;
        }
        return await useToolOnBlock(bot, toolName, block);
    }

    return true;
 }

 export async function useToolOnBlock(bot, toolName, block) {
    /**
     * Use a tool on a specific block.
     * @param {MinecraftBot} bot
     * @param {string} toolName - item name of the tool to equip, or "hand" for no tool.
     * @param {Block} block - the block reference to use the tool on.
     * @returns {Promise<boolean>} true if action succeeded
     */

    const distance = toolName === 'water_bucket' && block.name !== 'lava' ? 1.5 : 2;
    await goToPosition(bot, block.position.x, block.position.y, block.position.z, distance);
    await bot.lookAt(block.position.offset(0.5, 0.5, 0.5));

    // if block in view is closer than the target block, it is in our way. try to move closer
    const viewBlocked = () => {
        const blockInView = bot.blockAtCursor(5);
        const headPos = bot.entity.position.offset(0, bot.entity.height, 0);
        return blockInView && 
            !blockInView.position.equals(block.position) && 
            blockInView.position.distanceTo(headPos) < block.position.distanceTo(headPos);
    };
    const blockInView = bot.blockAtCursor(5);
    if (viewBlocked()) {
        log(bot, `Block ${blockInView.name} is in the way, moving closer...`);
        // choose random block next to target block, go to it
        const nearbyPos = block.position.offset(Math.random() * 2 - 1, 0, Math.random() * 2 - 1);
        await goToPosition(bot, nearbyPos.x, nearbyPos.y, nearbyPos.z, 1);
        await bot.lookAt(block.position.offset(0.5, 0.5, 0.5));
        if (viewBlocked()) {
            const blockInView = bot.blockAtCursor(5);
            log(bot, `Block ${blockInView.name} is in the way, not using ${toolName}.`);
            return false;
        }
    }

    const equipped = await equip(bot, toolName);

    if (!equipped) {
        log(bot, `Could not equip ${toolName}.`);
        return false;
    }
    if (toolName.includes('bucket')) {
        await bot.activateItem();
    }
    else {
        await bot.activateBlock(block);
    }
    log(bot, `Used ${toolName} on ${block.name}.`);
    return true;
}

export async function enterMinecart(bot, minecart_pos=null) {
    /**
     * Enter a minecart at the given position.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {Vec3} minecart_pos, the position of the minecart. If null, the nearest minecart will be used.
     * @returns {Promise<boolean>} true if the minecart was entered, false otherwise.
     * @example
     * await skills.enterMinecart(bot);
     **/
    try {
        if (!minecart_pos) {
            const minecarts = bot.entities
                .filter(e => e.type === 'minecart' || e.type === 'object')
                .sort((a, b) => a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position));
            
            if (minecarts.length === 0) {
                log(bot, `No minecart found nearby.`);
                return false;
            }
            minecart_pos = minecarts[0].position;
        }
        
        // Go to the minecart
        // RC25: Baritone gotoSmart replaces pathfinder.setGoal + isMoving poll
        if (!bot.ashfinder.stopped) bot.ashfinder.stop();
        await bot.ashfinder.gotoSmart(new baritoneGoals.GoalNear(minecart_pos, 1));
        
        // Right-click to enter
        await bot.lookAt(minecart_pos.offset(0.5, 0.5, 0.5));
        await new Promise((resolve) => setTimeout(resolve, 200));
        
        // Use interaction (activate the minecart)
        const minecartEntity = bot.nearestEntity(entity => 
            (entity.type === 'minecart' || entity.type === 'object') && 
            entity.position.distanceTo(minecart_pos) < 2
        );
        
        if (minecartEntity) {
            await bot.activateEntity(minecartEntity);
            await new Promise((resolve) => setTimeout(resolve, 500));
            log(bot, `Entered minecart at ${minecart_pos}.`);
            return true;
        }
        
        log(bot, `Could not find minecart entity to enter.`);
        return false;
    } catch (err) {
        log(bot, `Error entering minecart: ${err.message}`);
        return false;
    }
}

export async function exitMinecart(bot) {
    /**
     * Exit the current minecart.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @returns {Promise<boolean>} true if exited minecart, false otherwise.
     * @example
     * await skills.exitMinecart(bot);
     **/
    try {
        if (!bot.vehicle) {
            log(bot, `Not currently in a minecart.`);
            return false;
        }
        
        // Jump to exit
        bot.setControlState("jump", true);
        await new Promise((resolve) => setTimeout(resolve, 200));
        bot.setControlState("jump", false);
        
        await new Promise((resolve) => setTimeout(resolve, 300));
        log(bot, `Exited minecart.`);
        return true;
    } catch (err) {
        log(bot, `Error exiting minecart: ${err.message}`);
        return false;
    }
}

export async function getDiamondPickaxe(bot) {
    /**
     * Automatically obtain a diamond pickaxe by progressing through tool tiers.
     * Detects any existing pickaxe and starts from the appropriate tier,
     * so calling it twice is safe (idempotent).
     * Tiers: wooden → stone → iron → diamond.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @returns {Promise<boolean>} true if diamond pickaxe obtained, false otherwise.
     * @example
     * await skills.getDiamondPickaxe(bot);
     **/
    let inv;

    // Already done
    inv = world.getInventoryCounts(bot);
    if (inv['diamond_pickaxe'] > 0) {
        log(bot, 'Already have a diamond pickaxe!');
        return true;
    }

    // ── TIER 1: wooden pickaxe ───────────────────────────────────────────────
    inv = world.getInventoryCounts(bot);
    if (!inv['wooden_pickaxe'] && !inv['stone_pickaxe'] && !inv['iron_pickaxe']) {
        log(bot, 'Starting tool progression: collecting logs...');
        const logTypes = ['oak_log', 'birch_log', 'spruce_log', 'dark_oak_log',
                          'acacia_log', 'jungle_log', 'mangrove_log'];
        // Use logs already in inventory, or collect some
        let logType = logTypes.find(l => (inv[l] ?? 0) >= 3);
        if (!logType) {
            for (const lt of logTypes) {
                if (await collectBlock(bot, lt, 3)) { logType = lt; break; }
            }
        }
        if (!logType) {
            log(bot, 'Cannot find any logs to begin tool progression.');
            return false;
        }
        const plankType = logType.replace('_log', '_planks');
        if (!await craftRecipe(bot, plankType, 1)) {
            log(bot, `Failed to craft ${plankType}.`);
            return false;
        }
        if (!await craftRecipe(bot, 'stick', 1)) {
            log(bot, 'Failed to craft sticks.');
            return false;
        }
        if (!await craftRecipe(bot, 'wooden_pickaxe', 1)) {
            log(bot, 'Failed to craft wooden pickaxe.');
            return false;
        }
        log(bot, 'Wooden pickaxe crafted.');
    }

    // ── TIER 2: stone pickaxe ────────────────────────────────────────────────
    inv = world.getInventoryCounts(bot);
    if (!inv['stone_pickaxe'] && !inv['iron_pickaxe']) {
        log(bot, 'Collecting cobblestone for stone pickaxe...');
        if (!await collectBlock(bot, 'stone', 3)) {
            log(bot, 'Could not find stone. Try moving to a rocky area.');
            return false;
        }
        if (!await craftRecipe(bot, 'stone_pickaxe', 1)) {
            log(bot, 'Failed to craft stone pickaxe.');
            return false;
        }
        log(bot, 'Stone pickaxe crafted.');
    }

    // ── TIER 3: iron pickaxe ─────────────────────────────────────────────────
    inv = world.getInventoryCounts(bot);
    if (!inv['iron_pickaxe']) {
        log(bot, 'Collecting iron ore for iron pickaxe...');
        let gotIron = await collectBlock(bot, 'iron_ore', 3);
        if (!gotIron) gotIron = await collectBlock(bot, 'deepslate_iron_ore', 3);
        if (!gotIron) {
            log(bot, 'Could not find iron ore. Try digging deeper or exploring caves.');
            return false;
        }
        if (!await smeltItem(bot, 'raw_iron', 3)) {
            log(bot, 'Failed to smelt raw iron into iron ingots.');
            return false;
        }
        if (!await craftRecipe(bot, 'iron_pickaxe', 1)) {
            log(bot, 'Failed to craft iron pickaxe.');
            return false;
        }
        log(bot, 'Iron pickaxe crafted.');
    }

    // ── TIER 4: diamond pickaxe ──────────────────────────────────────────────
    log(bot, 'Digging to diamond level (y=-11)...');
    const targetY = -11;
    const currentY = Math.floor(bot.entity.position.y);
    if (currentY > targetY) {
        const dist = currentY - targetY;
        if (!await digDown(bot, dist)) {
            log(bot, 'Stopped before reaching diamond level (lava or cave gap detected). Try again from a different spot.');
            return false;
        }
    }

    log(bot, 'Searching for diamond ore...');
    let gotDiamonds = await collectBlock(bot, 'deepslate_diamond_ore', 3);
    if (!gotDiamonds) gotDiamonds = await collectBlock(bot, 'diamond_ore', 3);
    if (!gotDiamonds) {
        log(bot, 'No diamond ore found near y=-11. Explore at this depth and try again with !getDiamondPickaxe.');
        return false;
    }

    if (!await craftRecipe(bot, 'diamond_pickaxe', 1)) {
        log(bot, 'Failed to craft diamond pickaxe. Need 3 diamonds + 2 sticks on a crafting table.');
        return false;
    }

    await goToSurface(bot);
    log(bot, 'Diamond pickaxe obtained!');
    return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// GENERAL IMPROVEMENTS — Safe Movement, Combat, Inventory, Food
// ═══════════════════════════════════════════════════════════════════════════

export async function safeMoveTo(bot, x, y, z, options = {}) {
    /**
     * Navigate to a position with safety checks: avoids lava, deep water,
     * and large falls. Places torches underground every ~10 blocks.
     * If the bot is falling >2 blocks, attempts water bucket clutch.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {number} x, the x coordinate to navigate to.
     * @param {number} y, the y coordinate to navigate to.
     * @param {number} z, the z coordinate to navigate to.
     * @param {boolean} options.avoidLava, avoid lava paths (default true).
     * @param {boolean} options.lightPath, place torches underground (default true).
     * @param {number} options.timeout, navigation timeout in seconds (default 60).
     * @returns {Promise<boolean>} true if destination reached.
     * @example
     * await skills.safeMoveTo(bot, 100, 64, 200);
     * await skills.safeMoveTo(bot, 100, 64, 200, {avoidLava: true, lightPath: true});
     **/
    const avoidLava = options.avoidLava !== false;
    const lightPath = options.lightPath !== false;

    // Pre-flight: check destination is not in lava/void
    if (avoidLava && y < -64) {
        log(bot, 'Destination is below the void. Aborting.');
        return false;
    }

    const startPos = bot.entity.position.clone();
    let lastTorchPos = startPos.clone();
    let torchInterval = null;

    // Auto-torch placer for underground travel
    if (lightPath) {
        torchInterval = setInterval(async () => {
            try {
                const pos = bot.entity.position;
                if (pos.y < 50 && pos.distanceTo(lastTorchPos) >= 10) {
                    const inv = world.getInventoryCounts(bot);
                    if ((inv['torch'] || 0) > 0 && world.shouldPlaceTorch(bot)) {
                        await placeBlock(bot, 'torch', pos.x, pos.y, pos.z, 'bottom', true);
                        lastTorchPos = pos.clone();
                    }
                }
            } catch (_e) { /* non-critical */ }
        }, 3000);
    }

    // Fall detection: water bucket clutch
    let fallWatcher = null;
    const startFallWatch = () => {
        let lastY = bot.entity.position.y;
        let fallStart = -1;
        fallWatcher = setInterval(async () => {
            const curY = bot.entity.position.y;
            const vel = bot.entity.velocity;
            if (vel && vel.y < -0.5) {
                if (fallStart < 0) fallStart = lastY;
                const fallDist = fallStart - curY;
                if (fallDist > 4) {
                    // Attempt water bucket clutch
                    const waterBucket = bot.inventory.items().find(i => i.name === 'water_bucket');
                    if (waterBucket) {
                        try {
                            await bot.equip(waterBucket, 'hand');
                            const below = bot.blockAt(bot.entity.position.offset(0, -1, 0));
                            if (below) await bot.placeBlock(below, new Vec3(0, 1, 0));
                        } catch (_e) { /* best effort */ }
                    }
                }
            } else {
                fallStart = -1;
            }
            lastY = curY;
        }, 200);
    };
    startFallWatch();

    let success = false;
    try {
        success = await goToPosition(bot, x, y, z, 2);
    } catch (err) {
        log(bot, `safeMoveTo failed: ${err.message}`);
        success = false;
    } finally {
        if (torchInterval) clearInterval(torchInterval);
        if (fallWatcher) clearInterval(fallWatcher);
    }

    if (!success) {
        log(bot, `Could not safely reach (${x}, ${y}, ${z}).`);
    }
    return success;
}

export async function rangedAttack(bot, entityType, preferredWeapon = 'bow') {
    /**
     * Attack the nearest entity of a given type using a bow if available,
     * falling back to melee. Predicts target position for better aim.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} entityType, the type of entity to attack (e.g. 'blaze', 'skeleton').
     * @param {string} preferredWeapon, preferred ranged weapon: 'bow' or 'crossbow'. Default 'bow'.
     * @returns {Promise<boolean>} true if entity killed or driven off.
     * @example
     * await skills.rangedAttack(bot, "blaze");
     * await skills.rangedAttack(bot, "skeleton", "bow");
     **/
    const entity = world.getNearestEntityWhere(bot, e => e.name === entityType, 48);
    if (!entity) {
        log(bot, `No ${entityType} found nearby.`);
        return false;
    }

    const inv = world.getInventoryCounts(bot);
    const hasBow = (inv['bow'] || 0) > 0;
    const hasCrossbow = (inv['crossbow'] || 0) > 0;
    const hasArrows = (inv['arrow'] || 0) > 0;

    // If we have ranged weapon + arrows, use ranged attack
    if ((hasBow || hasCrossbow) && hasArrows) {
        const weaponName = (preferredWeapon === 'crossbow' && hasCrossbow) ? 'crossbow' : (hasBow ? 'bow' : 'crossbow');
        const weapon = bot.inventory.items().find(i => i.name === weaponName);
        if (weapon) await bot.equip(weapon, 'hand');

        log(bot, `Attacking ${entityType} with ${weaponName}...`);
        let attempts = 0;
        const maxAttempts = 20;
        while (entity.isValid && attempts < maxAttempts) {
            if (bot.interrupt_code) return false;
            attempts++;

            const dist = bot.entity.position.distanceTo(entity.position);
            if (dist > 40) {
                // Too far, close distance
                await goToPosition(bot, entity.position.x, entity.position.y, entity.position.z, 20);
                continue;
            }
            if (dist < 6) {
                // Too close for bow, use melee fallback
                await attackEntity(bot, entity, true);
                return true;
            }

            // Predict target position (lead the shot)
            const vel = entity.velocity || new Vec3(0, 0, 0);
            const flightTime = dist / 30; // approximate arrow speed
            const predictedPos = entity.position.offset(
                vel.x * flightTime,
                vel.y * flightTime + entity.height * 0.7,
                vel.z * flightTime
            );

            await bot.lookAt(predictedPos);

            // Activate bow (hold right click)
            bot.activateItem();
            await new Promise(r => setTimeout(r, 1200)); // charge bow
            bot.deactivateItem();
            await new Promise(r => setTimeout(r, 500));

            // Check if entity is dead
            if (!entity.isValid) {
                log(bot, `${entityType} defeated with ${weaponName}!`);
                return true;
            }
        }

        if (!entity.isValid) {
            log(bot, `${entityType} defeated!`);
            return true;
        }
    }

    // Fallback: melee attack
    log(bot, `No ranged weapon available, using melee against ${entityType}.`);
    return await attackNearest(bot, entityType, true);
}

export async function buildPanicRoom(bot) {
    /**
     * Emergency shelter: builds a 3x3x3 hollow cobblestone box around the bot.
     * Used when health is critically low. Eats available food inside.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @returns {Promise<boolean>} true if shelter built.
     * @example
     * await skills.buildPanicRoom(bot);
     **/
    const inv = world.getInventoryCounts(bot);
    const cobble = (inv['cobblestone'] || 0) + (inv['stone'] || 0) + (inv['deepslate'] || 0);
    const material = cobble >= 20 ?
        (inv['cobblestone'] >= 20 ? 'cobblestone' : (inv['stone'] >= 20 ? 'stone' : 'deepslate')) :
        null;

    if (!material || cobble < 20) {
        log(bot, 'Not enough blocks to build panic room (need 20+ cobblestone/stone).');
        // Just eat and heal in place
        await ensureFed(bot);
        return false;
    }

    log(bot, 'Building emergency shelter!');
    const pos = bot.entity.position;
    const bx = Math.floor(pos.x);
    const by = Math.floor(pos.y);
    const bz = Math.floor(pos.z);

    // Build floor, walls, and ceiling (3x3x3 hollow box)
    const offsets = [];
    for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
            offsets.push([dx, -1, dz]); // floor
            offsets.push([dx, 2, dz]);  // ceiling
        }
    }
    // walls
    for (let dy = 0; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (dx === -1 || dx === 1) {
                offsets.push([dx, dy, -1]);
                offsets.push([dx, dy, 0]);
                offsets.push([dx, dy, 1]);
            }
        }
        offsets.push([0, dy, -1]);
        offsets.push([0, dy, 1]);
    }

    let placed = 0;
    for (const [dx, dy, dz] of offsets) {
        if (bot.interrupt_code) return false;
        const block = bot.blockAt(new Vec3(bx + dx, by + dy, bz + dz));
        if (block && block.name === 'air') {
            try {
                await placeBlock(bot, material, bx + dx, by + dy, bz + dz, 'bottom', true);
                placed++;
            } catch (_e) { /* best effort */ }
        }
    }

    log(bot, `Panic room built with ${placed} blocks. Eating food...`);
    await ensureFed(bot);

    // Wait until health recovers
    let waitTime = 0;
    while (bot.health < 18 && waitTime < 30000) {
        if (bot.interrupt_code) return true;
        await new Promise(r => setTimeout(r, 2000));
        waitTime += 2000;
        if (bot.food < 18) await ensureFed(bot);
    }

    log(bot, `Health recovered to ${bot.health}. Breaking out...`);
    // Break front wall to exit
    try {
        await breakBlockAt(bot, bx, by, bz - 1);
        await breakBlockAt(bot, bx, by + 1, bz - 1);
    } catch (_e) { /* exit best effort */ }

    return true;
}

export async function ensureFed(bot) {
    /**
     * Eat the best available food item if hunger is below 18.
     * Prioritizes cooked food, then raw food.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @returns {Promise<boolean>} true if food was consumed.
     * @example
     * await skills.ensureFed(bot);
     **/
    if (bot.food >= 18) return true;

    // Food priority list (best to worst)
    const foodPriority = [
        'golden_apple', 'enchanted_golden_apple',
        'cooked_beef', 'cooked_porkchop', 'cooked_mutton',
        'cooked_salmon', 'cooked_cod', 'cooked_chicken', 'cooked_rabbit',
        'bread', 'baked_potato', 'beetroot_soup', 'mushroom_stew',
        'pumpkin_pie', 'cookie', 'melon_slice', 'sweet_berries',
        'apple', 'carrot', 'potato',
        'beef', 'porkchop', 'mutton', 'chicken', 'rabbit', 'cod', 'salmon',
        'dried_kelp', 'beetroot', 'rotten_flesh'
    ];

    const inv = world.getInventoryCounts(bot);
    for (const food of foodPriority) {
        if ((inv[food] || 0) > 0) {
            log(bot, `Eating ${food}...`);
            return await consume(bot, food);
        }
    }

    log(bot, 'No food available!');
    return false;
}

export async function autoManageInventory(bot) {
    /**
     * Clean up inventory: drop junk items, keep important items,
     * ensure at least 8 empty slots. Stores excess in a nearby chest if available.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @returns {Promise<boolean>} true if inventory was managed.
     * @example
     * await skills.autoManageInventory(bot);
     **/
    const junkItems = [
        'dirt', 'gravel', 'sand', 'andesite', 'diorite', 'granite',
        'cobbled_deepslate', 'tuff', 'netherrack', 'cobblestone',
        'rotten_flesh', 'poisonous_potato', 'spider_eye',
        'pufferfish', 'tropical_fish'
    ];

    // Keep threshold: always keep some cobblestone for crafting
    const keepAmounts = {
        'cobblestone': 64,
        'dirt': 0,
        'gravel': 0,
        'sand': 0,
        'andesite': 0,
        'diorite': 0,
        'granite': 0,
        'cobbled_deepslate': 0,
        'tuff': 0,
        'netherrack': 0,
        'rotten_flesh': 0,
        'poisonous_potato': 0,
        'spider_eye': 0,
        'pufferfish': 0,
        'tropical_fish': 0
    };

    const inv = world.getInventoryCounts(bot);
    let emptySlots = bot.inventory.emptySlotCount();
    let discarded = 0;

    if (emptySlots >= 8) {
        log(bot, `Inventory is fine (${emptySlots} empty slots).`);
        return true;
    }

    // Try to store in nearby chest first
    const chest = world.getNearestBlock(bot, 'chest', 32);
    if (chest) {
        log(bot, 'Storing excess items in nearby chest...');
        for (const item of junkItems) {
            if (bot.interrupt_code) return false;
            const count = inv[item] || 0;
            const keep = keepAmounts[item] || 0;
            const toStore = count - keep;
            if (toStore > 0) {
                await putInChest(bot, item, toStore);
                discarded += toStore;
            }
        }
    } else {
        // No chest — discard junk
        log(bot, 'No chest nearby. Discarding junk items...');
        for (const item of junkItems) {
            if (bot.interrupt_code) return false;
            const count = inv[item] || 0;
            const keep = keepAmounts[item] || 0;
            const toDrop = count - keep;
            if (toDrop > 0) {
                await discard(bot, item, toDrop);
                discarded += toDrop;
            }
            emptySlots = bot.inventory.emptySlotCount();
            if (emptySlots >= 8) break;
        }
    }

    emptySlots = bot.inventory.emptySlotCount();
    log(bot, `Inventory managed. Discarded/stored ${discarded} items. ${emptySlots} slots free.`);
    return emptySlots >= 8;
}

export async function stockpileFood(bot, quantity = 32) {
    /**
     * Gather food by hunting passive animals nearby. Cooks meat in a furnace
     * if fuel and furnace materials are available.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {number} quantity, target number of food items. Default 32.
     * @returns {Promise<boolean>} true if enough food collected.
     * @example
     * await skills.stockpileFood(bot, 32);
     **/
    const meatAnimals = ['cow', 'pig', 'sheep', 'chicken', 'rabbit'];

    // Count current food
    const foodItems = [
        'cooked_beef', 'cooked_porkchop', 'cooked_mutton', 'cooked_chicken', 'cooked_rabbit',
        'bread', 'apple', 'carrot', 'baked_potato', 'melon_slice', 'sweet_berries',
        'beef', 'porkchop', 'mutton', 'chicken', 'rabbit'
    ];

    let inv = world.getInventoryCounts(bot);
    let totalFood = 0;
    for (const f of foodItems) totalFood += (inv[f] || 0);

    log(bot, `Current food supply: ${totalFood}/${quantity}`);

    // Hunt animals until we have enough
    let huntAttempts = 0;
    while (totalFood < quantity && huntAttempts < 20) {
        if (bot.interrupt_code) return false;
        huntAttempts++;

        let hunted = false;
        for (const animal of meatAnimals) {
            const entity = world.getNearestEntityWhere(bot, e => e.name === animal, 32);
            if (entity) {
                await attackEntity(bot, entity, true);
                await pickupNearbyItems(bot);
                hunted = true;
                break;
            }
        }

        if (!hunted) {
            log(bot, 'No animals nearby. Exploring to find more...');
            await explore(bot, 60);
        }

        inv = world.getInventoryCounts(bot);
        totalFood = 0;
        for (const f of foodItems) totalFood += (inv[f] || 0);
    }

    // Cook raw meat if we have a furnace and fuel
    const rawMeats = ['beef', 'porkchop', 'mutton', 'chicken', 'rabbit'];
    inv = world.getInventoryCounts(bot);
    for (const meat of rawMeats) {
        if (bot.interrupt_code) return false;
        const rawCount = inv[meat] || 0;
        if (rawCount > 0) {
            const cooked = await smeltItem(bot, meat, rawCount);
            if (cooked) log(bot, `Cooked ${rawCount} ${meat}.`);
        }
    }

    inv = world.getInventoryCounts(bot);
    totalFood = 0;
    for (const f of foodItems) totalFood += (inv[f] || 0);
    log(bot, `Food stockpile complete: ${totalFood} food items.`);
    return totalFood >= quantity;
}

