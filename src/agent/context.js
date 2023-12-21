import { readFileSync } from 'fs';

import { getNearestBlock, getNearbyMobTypes, getNearbyPlayerNames, getNearbyBlockTypes, getInventoryCounts } from './world.js';
import { getAllItems } from '../utils/mcdata.js';


export function getStats(bot) {
    let res = 'STATS';
    res += `\n- position: x:${bot.entity.position.x}, y:${bot.entity.position.y}, z:${bot.entity.position.z}`;
    res += `\n- health: ${bot.health} / 20`;
    if (bot.time.timeOfDay < 6000) {
        res += '\n- time: Morning';
    } else if (bot.time.timeOfDay < 12000) {
        res += '\n- time: Afternoon';
    } else {
        res += '\n- time: Night';
    }
    return res;
}


export function getInventory(bot) {
    let inventory = getInventoryCounts(bot);
    let res = 'INVENTORY';
    for (const item in inventory) {
        if (inventory[item] && inventory[item] > 0)
            res += `\n- ${item}: ${inventory[item]}`;
    }
    if (res == 'INVENTORY') {
        res += ': none';
    }
    return res;
}


export function getBlocks(bot) {
    let res = 'NEARBY_BLOCKS';
    let blocks = getNearbyBlockTypes(bot);
    for (let i = 0; i < blocks.length; i++) {
        res += `\n- ${blocks[i]}`;
    }
    if (blocks.length == 0) {
        res += ': none';
    }
    return res;
}


export function getNearbyEntities(bot) {
    let res = 'NEARBY_ENTITIES';
    for (const entity of getNearbyPlayerNames(bot)) {
        res += `\n- player: ${entity}`;
    }
    for (const entity of getNearbyMobTypes(bot)) {
        res += `\n- mob: ${entity}`;
    }
    if (res == 'NEARBY_ENTITIES') {
        res += ': none';
    }
    return res;
}


export function getCraftable(bot) {
    const table = getNearestBlock(bot, 'crafting_table');
    let res = 'CRAFTABLE_ITEMS';
    for (const item of getAllItems()) {
        let recipes = bot.recipesFor(item.id, null, 1, table);
        if (recipes.length > 0) {
            res += `\n- ${item.name}`;
        }
    }
    if (res == 'CRAFTABLE_ITEMS') {
        res += ': none';
    }
    return res;
}


export function getDetailedSkills() {
    let res = 'namespace skills {';
    let contents = readFileSync("./utils/skills.js", "utf-8").split('\n');
    for (let i = 0; i < contents.length; i++) {
        if (contents[i].slice(0, 3) == '/**') {
            res += '\t' + contents[i];
        } else if (contents[i].slice(0, 2) == ' *') {
            res += '\t' + contents[i];
        } else if (contents[i].slice(0, 4) == ' **/') {
            res += '\t' + contents[i] + '\n\n';
        }
    }
    res = res.trim() + '\n}'
    return res;
}


export function getWorldFunctions() {
    let res = 'namespace world {';
    let contents = readFileSync("./utils/world.js", "utf-8").split('\n');
    for (let i = 0; i < contents.length; i++) {
        if (contents[i].slice(0, 3) == '/**') {
            res += '\t' + contents[i];
        } else if (contents[i].slice(0, 2) == ' *') {
            res += '\t' + contents[i];
        } else if (contents[i].slice(0, 4) == ' **/') {
            res += '\t' + contents[i] + '\n\n';
        }
    }
    res = res.trim() + '\n}'
    return res;
}
