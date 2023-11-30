import { getItemId } from "./mcdata.js";
import { getNearestBlock, getInventoryCounts, getInventoryStacks, getNearbyMobs, getNearbyBlocks } from "./world.js";
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
    let craftingTable = undefined;
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
    console.log('crafted');
    return true;
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
    const attackable = ['animal', 'monster', 'mob'];
    if (mob && attackable.includes(mob.type)) {
        let pos = mob.position;
        console.log(bot.entity.position.distanceTo(pos))

        if (!kill) {
            if (bot.entity.position.distanceTo(pos) > 5) {
                console.log('moving to mob...')
                bot.pathfinder.setMovements(new pf.Movements(bot));
                await bot.pathfinder.goto(new pf.goals.GoalNear(pos.x, pos.y, pos.z, 5));
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
            return true;
        }

    }
    log(bot, 'Could not find any '+mobType+' to attack.');
    return false;
}


export async function collectBlock(bot, blockType) {
    /**
     * Collect one of the given block type.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} blockType, the type of block to collect.
     * @returns {Promise<boolean>} true if the block was collected, false if the block type was not found.
     * @example
     * await skills.collectBlock(bot, "oak_log");
     **/
    const block = getNearestBlock(bot, blockType, 64);
    if (block) {
        // check if block is collectable
        await bot.tool.equipForBlock(block);

        const itemId = bot.heldItem ? bot.heldItem.type : null
        if (!block.canHarvest(itemId)) {
            log(bot, `Don't have right tools to harvest ${blockType}.`);
            return false;
        }
        await bot.collectBlock.collect(block);
        return true;
    }
    log(bot, `Could not find ${blockType} to collect.`);
    return false;
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

    const empty_blocks = ['air', 'water', 'lava', 'grass', 'tall_grass', 'snow', 'dead_bush', 'fern'];
    const targetBlock = bot.blockAt(new Vec3(x, y, z));
    if (!empty_blocks.includes(targetBlock.name)) {
        log(bot, `Cannot place block at ${targetBlock.position} because ${targetBlock.name} is in the way.`);
        return false;
    }
    // get the buildoffblock and facevec based on whichever adjacent block is not empty
    let buildOffBlock = null;
    let faceVec = null;
    const dirs = [Vec3(0, -1, 0), Vec3(0, 1, 0), Vec3(1, 0, 0), Vec3(-1, 0, 0), Vec3(0, 0, 1), Vec3(0, 0, -1)];
    for (let d of dirs) {
        const block = bot.blockAt(new Vec3(x, y, z).plus(d));
        if (!empty_blocks.includes(block.name)) {
            buildOffBlock = block;
            faceVec = new Vec3(-d.x, -d.y, -d.z);
            break;
        }
    }
    if (!buildOffBlock) {
        log(bot, `Cannot place block at ${targetBlock.position} because there is nothing to build off of.`);
        return false;
    }
    console.log("Placing on: ", buildOffBlock.position, buildOffBlock.name)

    let block = bot.inventory.items().find(item => item.name === blockType);
    if (!block) {
        log(bot, `Don't have any ${blockType} to place.`);
        return false;
    }
    await bot.equip(block, 'hand');


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
    // too close

    // turn to face the block
    await bot.lookAt(buildOffBlock.position.plus(faceVec));

    // can still throw error if blocked by a bot player or mob, but takes a long time to timeout
    bot.placeBlock(buildOffBlock, faceVec).catch(err => {console.log('placeBlock threw error, ignoring')});
    console.log("placing block...")

    // wait and then check if the block was placed
    await new Promise(resolve => setTimeout(resolve, 200));
    const newBlock = bot.blockAt(buildOffBlock.position.plus(faceVec));
    if (!newBlock) return false;
    if (newBlock.name !== blockType) {
        log(bot, `Failed to place ${blockType} at ${newBlock.position}.`);
        return false;
    }
    console.log('block placed')
    log(bot, `Successfully placed ${blockType} at ${newBlock.position}.`);
    return true;
}


export async function equipItem(bot, itemName) {
    /**
     * Equip the given item or block.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} itemName, the item or block name to equip.
     * @returns {Promise<boolean>} true if the item was equipped, false otherwise.
     * @example
     * await skills.equipItem(bot, "wooden_pickaxe");
     **/
    let item = null;
    for (let stack of getInventoryStacks(bot)) {
        if (stack.name == itemName) {
            item = stack;
            break;
        }
    }
    if (item == null)
        return false;
    await bot.equip(item, 'hand');
    return true;
}


export async function goToPosition(bot, x, y, z) {
    /**
     * Navigate to the given position.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {number} x, the x coordinate to navigate to. If null, the bot's current x coordinate will be used.
     * @param {number} y, the y coordinate to navigate to. If null, the bot's current y coordinate will be used.
     * @param {number} z, the z coordinate to navigate to. If null, the bot's current z coordinate will be used.
     * @returns {Promise<boolean>} true if the position was reached, false otherwise.
     * @example
     * let position = world.getPosition(bot);
     * await skills.goToPosition(bot, position.x, position.y, position.x + 20);
     **/
    if (x == null) x = bot.entity.position.x;
    if (y == null) y = bot.entity.position.y;
    if (z == null) z = bot.entity.position.z;
    bot.pathfinder.setMovements(new pf.Movements(bot));
    let pos = { x: x, y: y, z: z };
    await bot.pathfinder.goto(new pf.goals.GoalNear(pos.x, pos.y, pos.z, 1));
    return true;
}


export async function giveToPlayer(bot, itemType, username) {
    /**
     * Give one of the specified item to the specified player
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} itemType, the name of the item to give.
     * @param {string} username, the username of the player to give the item to.
     * @returns {Promise<boolean>} true if the item was given, false otherwise.
     * @example
     * await skills.giveToPlayer(bot, "oak_log", "player1");
     **/
    let player = bot.players[username].entity
    if (!player){
        log(bot, `Could not find ${username}.`);
        return false;
    }
    if (!getInventoryCounts(bot)[itemType]) {
        log(bot, `You do not have any ${itemType} to give.`);
        return false;
    }
    await goToPlayer(bot, username);
    let pos = player.position;
    await bot.lookAt(pos);
    await bot.toss(getItemId(itemType), null, 1);
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
    if (!player)
        return false;

    bot.pathfinder.setMovements(new pf.Movements(bot));
    let pos = player.position;
    let distance = 2;
    await bot.pathfinder.goto(new pf.goals.GoalNear(pos.x, pos.y, pos.z, distance));
    log(bot, `You have reached your destination.`);
    return true;
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
        console.log('followPlayer waiting for interrupt...', bot.interrupt_code);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return true;
}