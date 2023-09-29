import { getAllBlockIds } from './mcdata.js';


export function getNearbyBlocks(bot, distance) {
    let positions = bot.findBlocks({matching: getAllBlockIds(['air']), maxDistance: distance, count: 10000});
    let found = [];
    for (let i = 0; i < positions.length; i++) {
        let block = bot.blockAt(positions[i]);
        found.push(block);
    }
    return found;
}


/**
 * Get a list of all nearby block names.
 * @param {Bot} bot - The bot to get nearby blocks for.
 * @returns {string[]} - A list of all nearby blocks.
 * @example
 * let blocks = world.getNearbyBlockTypes(bot);
 **/
export function getNearbyBlockTypes(bot) {
    let blocks = getNearbyBlocks(bot, 16);
    let found = [];
    for (let i = 0; i < blocks.length; i++) {
        if (!found.includes(blocks[i].name)) {
            found.push(blocks[i].name);
        }
    }
    return found;
}
