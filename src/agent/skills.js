import { getItemId, getItemName } from "../utils/mcdata.js";
import { getNearestBlocks, getNearestBlock, getInventoryCounts, getInventoryStacks, getNearbyMobs, getNearbyBlocks } from "./world.js";
import pf from 'mineflayer-pathfinder';
import Vec3 from 'vec3';

export function log(bot, message) {
    bot.output += message + '\n';
}


export async function craftRecipe(bot, itemName) {
    /**
     * Attempt to craft the given item name from a recipe. May craft many items.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} itemName, the item name to craft.
     * @returns {Promise<boolean>} true if the item was crafted, false otherwise.
     * @example
     * await skills.craftRecipe(bot, "stick");
     **/
    let recipes = bot.recipesFor(getItemId(itemName), null, 1, null); // get recipes that don't require a crafting table
    let craftingTable = null;
    if (!recipes || recipes.length === 0) {
        craftingTable = getNearestBlock(bot, 'crafting_table', 6);
        if (craftingTable === null){
            log(bot, `You either do not have enough resources to craft ${itemName} or it requires a crafting table, but there is none nearby.`)
            return false;
        }
        recipes = bot.recipesFor(getItemId(itemName), null, 1, craftingTable);
    }
    if (!recipes || recipes.length === 0) {
        log(bot, `You do not have the resources to craft a ${itemName}.`);
        return false;
    }
    const recipe = recipes[0];

    console.log('crafting...');
    await bot.craft(recipe, 1, craftingTable);
    log(bot, `Successfully crafted ${itemName}, you now have ${getInventoryCounts(bot)[itemName]} ${itemName}.`);
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
    const foods = ['beef', 'chicken', 'cod', 'mutton', 'porkchop', 'rabbit', 'salmon', 'tropical_fish'];
    if (!itemName.includes('raw') && !foods.includes(itemName)) {
        log(bot, `Cannot smelt ${itemName}, must be a "raw" item, like "raw_iron".`);
        return false;
    } // TODO: allow cobblestone, sand, clay, etc.

    let furnaceBlock = undefined;
    furnaceBlock = getNearestBlock(bot, 'furnace', 6);
    if (!furnaceBlock){
        log(bot, `There is no furnace nearby.`)
        return false;
    }
    await bot.lookAt(furnaceBlock.position);

    console.log('smelting...');
    const furnace = await bot.openFurnace(furnaceBlock);
    // check if the furnace is already smelting something
    let input_item = furnace.inputItem();
    if (input_item && input_item.type !== getItemId(itemName) && input_item.count > 0) {
        // TODO: check if furnace is currently burning fuel. furnace.fuel is always null, I think there is a bug.
        // This only checks if the furnace has an input item, but it may not be smelting it and should be cleared.
        log(bot, `The furnace is currently smelting ${getItemName(input_item.type)}.`);
        return false;
    }
    // check if the bot has enough items to smelt
    let inv_counts = getInventoryCounts(bot);
    if (!inv_counts[itemName] || inv_counts[itemName] < num) {
        log(bot, `You do not have enough ${itemName} to smelt.`);
        return false;
    }

    // fuel the furnace
    if (!furnace.fuelItem()) {
        let fuel = bot.inventory.items().find(item => item.name === 'coal' || item.name === 'charcoal');
        let put_fuel = Math.ceil(num / 8);
        if (!fuel || fuel.count < put_fuel) {
            log(bot, `You do not have enough coal or charcoal to smelt ${num} ${itemName}, you need ${put_fuel} coal or charcoal`);
            return false;
        }
        await furnace.putFuel(fuel.type, null, put_fuel);
        log(bot, `Added ${put_fuel} ${getItemName(fuel.type)} to furnace fuel.`);
        console.log(`Added ${put_fuel} ${getItemName(fuel.type)} to furnace fuel.`)
    }
    // put the items in the furnace
    await furnace.putInput(getItemId(itemName), null, num);
    // wait for the items to smelt
    let total = 0;
    let collected_last = true;
    let smelted_item = null;
    await new Promise(resolve => setTimeout(resolve, 200));
    while (total < num) {
        await new Promise(resolve => setTimeout(resolve, 10000));
        console.log('checking...');
        let collected = false;
        if (furnace.outputItem()) {
            smelted_item = await furnace.takeOutput();
            if (smelted_item) {
                total += smelted_item.count;
                collected = true;
            }
        }
        if (!collected && !collected_last) {
            break; // if nothing was collected this time or last time
        }
        collected_last = collected;
        if (bot.interrupt_code) {
            break;
        }
    }

    if (total === 0) {
        log(bot, `Failed to smelt ${itemName}.`);
        return false;
    }
    if (total < num) {
        log(bot, `Only smelted ${total} ${getItemName(smelted_item.type)}.`);
        return false;
    }
    log(bot, `Successfully smelted ${itemName}, got ${total} ${getItemName(smelted_item.type)}.`);
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
    let furnaceBlock = getNearestBlock(bot, 'furnace', 6); 
    if (!furnaceBlock){
        log(bot, `There is no furnace nearby.`)
        return false;
    }

    console.log('clearing furnace...');
    const furnace = await bot.openFurnace(furnaceBlock);
    console.log('opened furnace...')
    // take the items out of the furnace
    let smelted_item, intput_item, fuel_item;
    if (furnace.outputItem())
        smelted_item = await furnace.takeOutput();
    if (furnace.inputItem())
        intput_item = await furnace.takeInput();
    if (furnace.fuelItem())
        fuel_item = await furnace.takeFuel();
    console.log(smelted_item, intput_item, fuel_item)
    let smelted_name = smelted_item ? `${smelted_item.count} ${smelted_item.name}` : `0 smelted items`;
    let input_name = intput_item ? `${intput_item.count} ${intput_item.name}` : `0 input items`;
    let fuel_name = fuel_item ? `${fuel_item.count} ${fuel_item.name}` : `0 fuel items`;
    log(bot, `Cleared furnace, recieved ${smelted_name}, ${input_name}, and ${fuel_name}.`);
    return true;

}


function equipHighestAttack(bot) {
    let weapons = bot.inventory.items().filter(item => item.name.includes('sword') || item.name.includes('axe') || item.name.includes('pickaxe') || item.name.includes('shovel'));
    let weapon = weapons.sort((a, b) => b.attackDamage - a.attackDamage)[0];
    if (weapon)
        bot.equip(weapon, 'hand');
}

export async function attackMob(bot, mobType, kill=true) {
    /**
     * Attack mob of the given type.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} mobType, the type of mob to attack.
     * @param {boolean} kill, whether or not to continue attacking until the mob is dead. Defaults to true.
     * @returns {Promise<boolean>} true if the mob was attacked, false if the mob type was not found.
     * @example
     * await skills.attackMob(bot, "zombie", true);
     **/
    const mob = bot.nearestEntity(entity => entity.name && entity.name.toLowerCase() === mobType.toLowerCase());
    if (mob) {
        let pos = mob.position;
        console.log(bot.entity.position.distanceTo(pos))

        equipHighestAttack(bot)

        if (!kill) {
            if (bot.entity.position.distanceTo(pos) > 5) {
                console.log('moving to mob...')
                await goToPosition(bot, pos.x, pos.y, pos.z);
            }
            console.log('attacking mob...')
            await bot.attack(mob);
        }
        else {
            bot.pvp.attack(mob);
            while (getNearbyMobs(bot, 16).includes(mob)) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                if (bot.interrupt_code) {
                    bot.pvp.stop();
                    return false;
                }
            }
            log(bot, `Successfully killed ${mobType}.`);
            await pickupNearbyItem(bot);
            return true;
        }

    }
    log(bot, 'Could not find any '+mobType+' to attack.');
    return false;
}


export async function collectBlock(bot, blockType, num=1) {
    /**
     * Collect one of the given block type.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} blockType, the type of block to collect.
     * @param {number} num, the number of blocks to collect. Defaults to 1.
     * @returns {Promise<boolean>} true if the block was collected, false if the block type was not found.
     * @example
     * await skills.collectBlock(bot, "oak_log");
     **/
    if (num < 1) {
        log(bot, `Invalid number of blocks to collect: ${num}.`);
        return false;
    }
    let collected = 0;
    const blocks = getNearestBlocks(bot, blockType, 64, num);
    if (blocks.length === 0) {
        log(bot, `Could not find any ${blockType} to collect.`);
        return false;
    }
    const first_block = blocks[0];
    await bot.tool.equipForBlock(first_block);
    const itemId = bot.heldItem ? bot.heldItem.type : null
    if (!first_block.canHarvest(itemId)) {
        log(bot, `Don't have right tools to harvest ${blockType}.`);
        return false;
    }

    for (let block of blocks) {
        try {
            await bot.collectBlock.collect(block);
            collected++;
        }
        catch (err) {
            if (err.name === 'NoChests') {
                log(bot, `Failed to collect ${blockType}: Inventory full, no place to deposit.`);
                break;
            }
            else {
                log(bot, `Failed to collect ${blockType}: ${err}.`);
                continue;
            }
        }
        if (bot.interrupt_code)
            break;  
    }
    log(bot, `Collected ${collected} ${blockType}.`);
    return true;
}

export async function pickupNearbyItem(bot) {
    /**
     * Pick up all nearby items.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @returns {Promise<boolean>} true if the items were picked up, false otherwise.
     * @example
     * await skills.pickupNearbyItem(bot);
     **/
    const distance = 10;
    let nearestItem = bot.nearestEntity(entity => entity.name === 'item' && bot.entity.position.distanceTo(entity.position) < distance);

    if (!nearestItem) {
        log(bot, `Didn't pick up items.`);
        return false;
    }
    bot.pathfinder.setMovements(new pf.Movements(bot));
    await bot.pathfinder.goto(new pf.goals.GoalNear(nearestItem.position.x, nearestItem.position.y, nearestItem.position.z, 1));
    log(bot, `Successfully picked up a dropped item.`);
    return true;
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
    let current = bot.blockAt(Vec3(x, y, z));
    if (current.name != 'air')
        await bot.dig(current, true);
    return true;
}


export async function placeBlock(bot, blockType, x, y, z) {
    /**
     * Place the given block type at the given position. It will build off from any adjacent blocks. Will fail if there is a block in the way or nothing to build off of.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} blockType, the type of block to place.
     * @param {number} x, the x coordinate of the block to place.
     * @param {number} y, the y coordinate of the block to place.
     * @param {number} z, the z coordinate of the block to place.
     * @returns {Promise<boolean>} true if the block was placed, false otherwise.
     * @example
     * let position = world.getPosition(bot);
     * await skills.placeBlock(bot, "oak_log", position.x + 1, position.y - 1, position.x);
     **/
    const target_dest = new Vec3(Math.floor(x), Math.floor(y), Math.floor(z));
    const empty_blocks = ['air', 'water', 'lava', 'grass', 'tall_grass', 'snow', 'dead_bush', 'fern'];
    const targetBlock = bot.blockAt(target_dest);
    if (!empty_blocks.includes(targetBlock.name)) {
        log(bot, `Cannot place block at ${targetBlock.position} because ${targetBlock.name} is in the way.`);
        return false;
    }
    // get the buildoffblock and facevec based on whichever adjacent block is not empty
    let buildOffBlock = null;
    let faceVec = null;
    const dirs = [Vec3(0, -1, 0), Vec3(0, 1, 0), Vec3(1, 0, 0), Vec3(-1, 0, 0), Vec3(0, 0, 1), Vec3(0, 0, -1)];
    for (let d of dirs) {
        const block = bot.blockAt(target_dest.plus(d));
        if (!empty_blocks.includes(block.name)) {
            buildOffBlock = block;
            faceVec = new Vec3(-d.x, -d.y, -d.z);
            break;
        }
    }
    if (!buildOffBlock) {
        log(bot, `Cannot place ${blockType} at ${targetBlock.position}: nothing to place on.`);
        return false;
    }
    console.log("Placing on: ", buildOffBlock.position, buildOffBlock.name)

    let block = bot.inventory.items().find(item => item.name === blockType);
    if (!block) {
        log(bot, `Don't have any ${blockType} to place.`);
        return false;
    }

    // too close
    let blockAbove = bot.blockAt(targetBlock.position.plus(Vec3(0,1,0)))
    if (bot.entity.position.distanceTo(targetBlock.position) < 1 || bot.entity.position.distanceTo(blockAbove.position) < 1) {
        console.log('moving away from block...')
        let found = false;
        for(let i = 0; i < 10; i++) {
            console.log('looking for block...')
            const randomDirection = new Vec3((Math.random() > 0.5 ? 1 : -1), 0, (Math.random() > 0.5 ? 1 : -1));
            const pos = targetBlock.position.add(randomDirection.scale(1.2));
            if (bot.blockAt(pos).name === 'air') {
                console.log('found good position')
                bot.pathfinder.setMovements(new pf.Movements(bot));
                await bot.pathfinder.goto(new pf.goals.GoalNear(pos.x, pos.y, pos.z, 1.2));
                found = true;
                break;
            }
        }
        if (!found) {
            console.log('could not find good position')
            log(bot, `Was too close to place ${blockType} at ${targetBlock.position}.`)
            return false;
        }
    }
    // too far
    if (bot.entity.position.distanceTo(targetBlock.position) > 4.5) {
        // move close until it is within 6 blocks
        console.log('moving closer to block...')
        let pos = targetBlock.position;
        bot.pathfinder.setMovements(new pf.Movements(bot));
        await bot.pathfinder.goto(new pf.goals.GoalNear(pos.x, pos.y, pos.z, 4));
    }
    
    await bot.equip(block, 'hand');
    await bot.lookAt(buildOffBlock.position);

    console.log("placing block...")

    console.log('entities:', buildOffBlock.blockEntity, targetBlock.blockEntity)
    // will throw error if an entity is in the way, and sometimes even if the block was placed
    try {
        await bot.placeBlock(buildOffBlock, faceVec);
        log(bot, `Successfully placed ${blockType} at ${target_dest}.`);
        await new Promise(resolve => setTimeout(resolve, 200));
        return true;
    } catch (err) {
        log(bot, `Failed to place ${blockType} at ${target_dest}.`);
        return false;
    }
}

export async function equip(bot, itemName, bodyPart) {
    /**
     * Equip the given item to the given body part, like tools or armor.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} itemName, the item or block name to equip.
     * @param {string} bodyPart, the body part to equip the item to.
     * @returns {Promise<boolean>} true if the item was equipped, false otherwise.
     * @example
     * await skills.equip(bot, "iron_pickaxe", "hand");
     * await skills.equip(bot, "diamond_chestplate", "torso");
     **/
    let item = bot.inventory.items().find(item => item.name === itemName);
    if (!item) {
        log(bot, `You do not have any ${itemName} to equip.`);
        return false;
    }
    await bot.equip(item, bodyPart);
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
    log(bot, `Successfully discarded ${discarded} ${itemName}.`);
    return true;
}

export async function eat(bot, foodName="") {
    /**
     * Eat the given item. If no item is given, it will eat the first food item in the bot's inventory.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} item, the item to eat.
     * @returns {Promise<boolean>} true if the item was eaten, false otherwise.
     * @example
     * await skills.eat(bot, "apple");
     **/
    let item, name;
    if (foodName) {
        item = bot.inventory.items().find(item => item.name === foodName);
        name = foodName;
    }
    else {
        item = bot.inventory.items().find(item => item.foodRecovery > 0);
        name = "food";
    }
    if (!item) {
        log(bot, `You do not have any ${name} to eat.`);
        return false;
    }
    await bot.equip(item, 'hand');
    await bot.consume();
    log(bot, `Successfully ate ${item.name}.`);
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
    let player = bot.players[username].entity
    if (!player){
        log(bot, `Could not find ${username}.`);
        return false;
    }
    await goToPlayer(bot, username);
    await bot.lookAt(player.position);
    discard(bot, itemType, num);
    return true;
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
     * let position = world.getNearestBlock(bot, "oak_log", 64).position;
     * await skills.goToPosition(bot, position.x, position.y, position.x + 20);
     **/
    if (x == null || y == null || z == null) {
        log(bot, `Missing coordinates, given x:${x} y:${y} z:${z}`);
        return false;
    }
    bot.pathfinder.setMovements(new pf.Movements(bot));
    await bot.pathfinder.goto(new pf.goals.GoalNear(x, y, z, min_distance));
    log(bot, `You have reached at ${x}, ${y}, ${z}.`);
    return true;
}


export async function goToPlayer(bot, username) {
    /**
     * Navigate to the given player.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} username, the username of the player to navigate to.
     * @returns {Promise<boolean>} true if the player was found, false otherwise.
     * @example
     * await skills.goToPlayer(bot, "player");
     **/
    let player = bot.players[username].entity
    if (!player) {
        log(bot, `Could not find ${username}.`);
        return false;
    }
    
    bot.pathfinder.setMovements(new pf.Movements(bot));
    await bot.pathfinder.goto(new pf.goals.GoalFollow(player, 2), true);

    log(bot, `You have reached ${username}.`);
}


export async function followPlayer(bot, username) {
    /**
     * Follow the given player endlessly. Will not return until the code is manually stopped.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} username, the username of the player to follow.
     * @returns {Promise<boolean>} true if the player was found, false otherwise.
     * @example
     * await skills.followPlayer(bot, "player");
     **/
    let player = bot.players[username].entity
    if (!player)
        return false;

    bot.pathfinder.setMovements(new pf.Movements(bot));
    bot.pathfinder.setGoal(new pf.goals.GoalFollow(player, 2), true);
    log(bot, `You are now actively following player ${username}.`);

    while (!bot.interrupt_code) {
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return true;
}

export async function defendPlayer(bot, username) {
    /**
     * Defend the given player endlessly, attacking any nearby monsters. Will not return until the code is manually stopped.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} username, the username of the player to defend.
     * @returns {Promise<boolean>} true if the player was found, false otherwise.
     * @example
     * await skills.defendPlayer(bot, "bob");
     **/
    let player = bot.players[username].entity
    if (!player)
        return false;

    const follow_distance = 3;
    const attack_distance = 12;
    const return_distance = 16;

    bot.pathfinder.setMovements(new pf.Movements(bot));
    bot.pathfinder.setGoal(new pf.goals.GoalFollow(player, follow_distance), true);
    log(bot, `Actively defending player ${username}.`);

    while (!bot.interrupt_code) {
        if (bot.entity.position.distanceTo(player.position) < return_distance) {
            const mobs = getNearbyMobs(bot, attack_distance).filter(mob => mob.type === 'mob' || mob.type === 'hostile');
            const mob = mobs.sort((a, b) => a.position.distanceTo(player.position) - b.position.distanceTo(player.position))[0]; // get closest to player
            if (mob) {
                bot.pathfinder.stop();
                log(bot, `Found ${mob.name}, attacking!`);
                bot.chat(`Found ${mob.name}, attacking!`);
                equipHighestAttack(bot);
                bot.pvp.attack(mob);
                while (getNearbyMobs(bot, attack_distance).includes(mob)) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                    console.log('attacking...')
                    if (bot.interrupt_code)
                        return;
                    if (bot.entity.position.distanceTo(player.position) > return_distance) {
                        console.log('stopping pvp...');
                        bot.pvp.stop();
                        break;
                    }
                }
                console.log('resuming pathfinder...')
                bot.pathfinder.setMovements(new pf.Movements(bot));
                bot.pathfinder.setGoal(new pf.goals.GoalFollow(player, 5), true);
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    return true;
}