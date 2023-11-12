import { getItemId } from "./mcdata.js";
import { getCraftingTable, getInventoryCounts, getInventoryStacks, getNearbyMobs, getNearbyBlocks } from "./world.js";
import pf from 'mineflayer-pathfinder';
import Vec3 from 'vec3';

function log(bot, message) {
    bot.output += message + '\n';
}

function f(x) {
    return Math.floor(x);
}

export async function craftItem(bot, itemName) {
    /**
     * Attempt to craft the given item.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} item_name, the item name to craft.
     * @returns {Promise<boolean>} true if the item was crafted, false otherwise.
     * @example
     * await skills.craftItem(bot, "wooden_pickaxe");
     **/
    const table = getCraftingTable(bot);
    let recipes = bot.recipesFor(getItemId(itemName), null, 1, table);
    await bot.craft(recipes[0], 1, null);
    return true;
}


export async function attackMob(bot, mobType) {
    /**
     * Attack mob of the given type.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} mobType, the type of mob to attack.
     * @returns {Promise<boolean>} true if the mob was attacked, false if the mob type was not found.
     * @example
     * await skills.attackMob(bot, "zombie");
     **/
    const mobs = getNearbyMobs(bot);
    for (let i = 0; i < mobs.length; i++) {
        if (mobs[i].mobType == mobType) {
            bot.attack(mobs[i]);
            return true;
        }
    }
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
    const blocks = getNearbyBlocks(bot);
    for (let i = 0; i < blocks.length; i++) {
        if (blocks[i].name == blockType) {
            await bot.collectBlock.collect(blocks[i]);
            return true;
        }
    }
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


export async function placeBlock(bot, blockType, x, y, z, faceVec=new Vec3(0, 1, 0)) {
    /**
     * Place the given block type at the given position.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} blockType, the type of block to place.
     * @param {number} x, the x coordinate of the block to place.
     * @param {number} y, the y coordinate of the block to place.
     * @param {number} z, the z coordinate of the block to place.
     * @param {Vec3} faceVec, the face of the block to place against. Defaults to the top face.
     * @returns {Promise<boolean>} true if the block was placed, false otherwise.
     * @example
     * let position = world.getPosition(bot);
     * await skills.placeBlock(bot, "oak_log", position.x + 1, position.y, position.x, new Vec3(1, 0, 0));
     **/

    // top face: new Vec3(0, 1, 0)
    // bottom face: new Vec3(0, -1, 0)
    // north face: new Vec3(0, 0, -1)
    // south face: new Vec3(0, 0, 1)
    // east face: new Vec3(1, 0, 0)
    // west face: new Vec3(-1, 0, 0)

    let referenceBlock = bot.blockAt(new Vec3(x, y, z));
    console.log("reference block", referenceBlock.name)

    // check if bot is blocking the block to place
    // if (bot.entity.position.distanceTo(referenceBlock.position) < 2) {
    //     console.log("bot is blocking block to place")
    //     // move out of the way
    //     let pos = bot.entity.position;
    //     let dx = pos.x - referenceBlock.position.x;
    //     let dz = pos.z - referenceBlock.position.z;
    //     let moveVec = new Vec3(dx, 0, dz);
    //     await bot.pathfinder.setMovements(new pf.Movements(bot));
    //     bot.pathfinder.setGoal(new pf.goals.GoalBlock(referenceBlock.position.x + moveVec.x, referenceBlock.position.y, referenceBlock.position.z + moveVec.z));
    // }
    // all blocks that can be replaced by another block:
    let blocks_to_allow = ['air', 'water', 'lava', 'grass', 'tall_grass'];
    if (!blocks_to_allow.includes(referenceBlock.name)) {
        log(bot, `Block at ${f(x)}, ${f(y)}, ${f(z)} is ${referenceBlock.name} and cannot be replaced.`);
        return false;
    }
    let block = bot.inventory.items().find(item => item.name === blockType);
    if (!block) {
        log(bot, `Don't have any ${blockType} to place.`);
        return false;
    }
    await bot.equip(block, 'hand');

    // placeblock's callback is broken (always returns error)
    bot.placeBlock(referenceBlock, faceVec).catch(err => {});

    // await to check if block was actually placed
    return await new Promise((resolve) => {
        setTimeout(() => {
            let current = bot.blockAt(new Vec3(x, y, z));
            console.log("Checking current block", current.name);
            if (current.name !== blockType) {
                console.log('Failed to place block')
                log(bot, `Failed to place block ${blockType} at ${f(x)}, ${f(y)}, ${f(z)}, which is ${current.name}.`);
                resolve(false);
            } else {
                console.log('Successfully placed block')
                resolve(true);
            }
        }, 1000);
    });
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
    bot.pathfinder.setGoal(new pf.goals.GoalNear(pos.x, pos.y, pos.z, 1));
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
    if (!player)
        return false;
    if (getInventoryCounts(bot)[itemType] == 0)
        return false;
    goToPlayer(bot, username);
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
    if (bot.entity.position.distanceTo(pos) > distance+1) {
        log(bot, `Failed to reach player ${username} (${bot.entity.position.distanceTo(pos)}m away)`);
        return false;
    }
    log(bot, `You have reached player ${username}.`);
    return true;
}


export async function followPlayer(bot, username) {
    /**
     * Follow the given player endlessly.
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
    let pos = player.position;
    bot.pathfinder.setGoal(new pf.goals.GoalFollow(player, 3), true);
    log(bot, `You are now actively following player ${username}.`);
    return true;
    
}