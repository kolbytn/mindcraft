import minecraftData from 'minecraft-data';
import { createBot } from 'mineflayer';
import { pathfinder } from 'mineflayer-pathfinder';
import pvp from 'mineflayer-pvp';
import { plugin } from 'mineflayer-collectblock';

const mc_version = '1.19.3'
let mcdata = minecraftData(mc_version);


export function initBot(username) {
    let bot = createBot({
        host: 'localhost',
        port: 55916,
        username: username,
        version: mc_version,
    });
    bot.loadPlugin(pathfinder)
    bot.loadPlugin(pvp.plugin)
    bot.loadPlugin(plugin)
    return bot;
}

export function getItemId(item) {
    return mcdata.itemsByName[item].id;
}

export function getItemName(itemId) {
    return mcdata.items[itemId].name;
}

export function getAllItems(ignore) {
    if (!ignore) {
        ignore = [];
    }
    let items = []
    for (const itemId in mcdata.items) {
        const item = mcdata.items[itemId];
        if (!ignore.includes(item.name)) {
            items.push(item);
        }
    }
    return items;
}


export function getAllItemIds(ignore) {
    const items = getAllItems(ignore);
    let itemIds = [];
    for (const item of items) {
        itemIds.push(item.id);
    }
    return itemIds;
}


export function getAllBlocks(ignore) {
    if (!ignore) {
        ignore = [];
    }
    let blocks = []
    for (const blockId in mcdata.blocks) {
        const block = mcdata.blocks[blockId];
        if (!ignore.includes(block.name)) {
            blocks.push(block);
        }
    }
    return blocks;
}


export function getAllBlockIds(ignore) {
    const blocks = getAllBlocks(ignore);
    let blockIds = [];
    for (const block of blocks) {
        blockIds.push(block.id);
    }
    return blockIds;
}
