import { getAllBlockIds, getAllBlocks, getAllItems } from './mcdata.js';


export function getNearestBlock(bot, block_type) {
    let block_locs = bot.findBlocks({
        matching: (block) => {
            return block && block.type === bot.registry.blocksByName[block_type].id
        },
        maxDistance: 6,
        count: 1
    });
    if (block_locs.length > 0) {
        return bot.blockAt(block_locs[0]);
    }
    return null;
}


export function getNearbyBlocks(bot, maxDistance) {
    if (maxDistance == null) maxDistance = 16;
    let positions = bot.findBlocks({matching: getAllBlockIds(['air']), maxDistance: maxDistance, count: 10000});
    let blocks = [];
    for (let i = 0; i < positions.length; i++) {
        let block = bot.blockAt(positions[i]);
        let distance = positions[i].distanceTo(bot.entity.position);
        blocks.push({ block: block, distance: distance });
    }
    blocks.sort((a, b) => a.distance - b.distance);
    let res = [];
    for (let i = 0; i < blocks.length; i++) {
        res.push(blocks[i].block);
    }
    return res;
}


export function getNearbyMobs(bot, maxDistance) {
    if (maxDistance == null) maxDistance = 16;
    let entities = [];
    for (const entity of Object.values(bot.entities)) {
        const distance = entity.position.distanceTo(bot.entity.position);
        if (distance > maxDistance) continue;
        if (entity.type == 'mob') {
            entities.push({ entity: entity, distance: distance });
        } 
    }
    entities.sort((a, b) => a.distance - b.distance);
    let res = [];
    for (let i = 0; i < entities.length; i++) {
        res.push(entities[i].entity);
    }
    return res;
}


export function getNearbyPlayers(bot, maxDistance) {
    if (maxDistance == null) maxDistance = 16;
    let players = [];
    for (const entity of Object.values(bot.entities)) {
        const distance = entity.position.distanceTo(bot.entity.position);
        if (distance > maxDistance) continue;
        if (entity.type == 'player' && entity.username != bot.username) {
            players.push({ entity: entity, distance: distance });
        } 
    }
    players.sort((a, b) => a.distance - b.distance);
    let res = [];
    for (let i = 0; i < players.length; i++) {
        res.push(players[i].entity);
    }
    return res;
}


export function getInventoryStacks(bot) {
    let inventory = [];
    for (const item of bot.inventory.slots.values()) {
        if (item != null) {
            inventory.push(item);
        }
    }
    return inventory;
}


export function getInventoryCounts(bot) {
    /**
     * Get an object representing the bot's inventory.
     * @param {Bot} bot - The bot to get the inventory for.
     * @returns {object} - An object with item names as keys and counts as values.
     * @example
     * let inventory = world.getInventoryCounts(bot);
     * let oakLogCount = inventory['oak_log'];
     * let hasWoodenPickaxe = inventory['wooden_pickaxe'] > 0;
     **/
    let inventory = {};
    for (const item of getInventoryStacks(bot)) {
        if (inventory.hasOwnProperty(item.name)) {
            inventory[item.name] = inventory[item.name] + item.count;
        } else {
            inventory[item.name] = item.count;
        }
    }
    return inventory;
}


export function getPosition(bot) {
    /**
     * Get your position in the world (Note that y is vertical).
     * @param {Bot} bot - The bot to get the position for.
     * @returns {Vec3} - An object with x, y, and x attributes representing the position of the bot.
     * @example
     * let position = world.getPosition(bot);
     * let x = position.x;
     **/
    return bot.entity.position;
}


export function getNearbyMobTypes(bot) {
    /**
     * Get a list of all nearby mob types.
     * @param {Bot} bot - The bot to get nearby mobs for.
     * @returns {string[]} - A list of all nearby mobs.
     * @example
     * let mobs = world.getNearbyMobTypes(bot);
     **/
    let mobs = getNearbyMobs(bot, 16);
    let found = [];
    for (let i = 0; i < mobs.length; i++) {
        if (!found.includes(mobs[i].mobType)) {
            found.push(mobs[i].mobType);
        }
    }
    return found;
}


export function getNearbyPlayerNames(bot) {
    /**
     * Get a list of all nearby player names.
     * @param {Bot} bot - The bot to get nearby players for.
     * @returns {string[]} - A list of all nearby players.
     * @example
     * let players = world.getNearbyPlayerNames(bot);
     **/
    let players = getNearbyPlayers(bot, 16);
    let found = [];
    for (let i = 0; i < players.length; i++) {
        if (!found.includes(players[i].username) && players[i].username != bot.username) {
            found.push(players[i].username);
        }
    }
    return found;
}


export function getNearbyBlockTypes(bot) {
    /**
     * Get a list of all nearby block names.
     * @param {Bot} bot - The bot to get nearby blocks for.
     * @returns {string[]} - A list of all nearby blocks.
     * @example
     * let blocks = world.getNearbyBlockTypes(bot);
     **/
    let blocks = getNearbyBlocks(bot, 16);
    let found = [];
    for (let i = 0; i < blocks.length; i++) {
        if (!found.includes(blocks[i].name)) {
            found.push(blocks[i].name);
        }
    }
    return found;
}


export function getNearestBlockPosition(bot, blockType) {
    /**
     * Get the position of the nearest block of the given type.
     * @param {Bot} bot - The bot to get the nearest block for.
     * @param {string} blockType - The type of the block to search for.
     * @returns {Vec3} - The position of the nearest block of the given type if found else null.
     * @example
     * let position = world.getNearestBlockPosition(bot, 'coal_ore');
     **/
    let blocks = getNearbyBlocks(bot, 16);
    for (let i = 0; i < blocks.length; i++) {
        if (blocks[i].name == blockType) {
            return blocks[i].position;
        }
    }
    return null;
}
