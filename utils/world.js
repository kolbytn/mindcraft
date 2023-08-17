import { getAllBlockIds } from './mcdata.js';


/**
 * Get a list of all nearby blocks.
 * @param {Bot} bot - The bot to get nearby blocks for.
 * @returns {string[]} - A list of all nearby blocks.
 * @example
 * let blocks = world.getNearbyBlocks(bot);
 **/
export function getNearbyBlocks(bot) {
    let positions = bot.findBlocks({'matching': getAllBlockIds(['air']), 'maxDistance': 16, 'count': 4096});
    let found = [];
    for (let i = 0; i < positions.length; i++) {
        let block = bot.blockAt(positions[i]);
        if (!found.includes(block.name)) {
            found.push(block.name);
        }
    }
    return found;
}
