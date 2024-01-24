import minecraftData from 'minecraft-data';
import { createBot } from 'mineflayer';
import { pathfinder } from 'mineflayer-pathfinder';
import { plugin as pvp } from 'mineflayer-pvp';
import { plugin as collectblock } from 'mineflayer-collectblock';
import { plugin as autoEat } from 'mineflayer-auto-eat';
import plugin from 'mineflayer-armor-manager';
const armorManager = plugin;

const mc_version = '1.20.1'
const mcdata = minecraftData(mc_version);


export function initBot(username) {
    let bot = createBot({
        username: username,

        host: 'localhost',
        port: 55916,
        
        // host: '000.111.222.333', 
        // port: 55920,
        // auth: 'microsoft',

        version: mc_version,
    });
    bot.loadPlugin(pathfinder);
    bot.loadPlugin(pvp);
    bot.loadPlugin(collectblock);
    bot.loadPlugin(autoEat);
    bot.loadPlugin(armorManager); // auto equip armor

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

export function getBiomeName(bot) {
    const biomeId = bot.world.getBiome(bot.entity.position);
    return mcdata.biomes[biomeId].name;
}
