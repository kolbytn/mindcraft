import { readFileSync } from 'fs';

import { getNearbyBlocks, getNearbyBlockTypes } from './world.js';
import { getAllItems } from './mcdata.js';


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
    let res = 'INVENTORY';
    let allItems = new Map();
    for (const item of bot.inventory.slots.values()) {
        if (item != null) {
            if (allItems.has(item.name)) {
                allItems.set(item.name, allItems.get(item.name) + item.count);
            } else {
                allItems.set(item.name, item.count);
            }
        }
    }
    for (const [item, count] of allItems.entries()) {
        res += `\n- ${item}: ${count}`;
    }
    if (allItems.size == 0) {
        res += ': empty';
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
    for (const entity of Object.values(bot.entities)) {
        const distance = entity.position.distanceTo(bot.entity.position);
        if (distance > 50) continue;
        if (entity.type == 'mob') {
            res += `\n- mob: ${entity.mobType}`;
        } else if (entity.type == 'player' && entity.username != bot.username) {
            res += `\n- player: ${entity.username}`;
        }
    }
    if (res == 'NEARBY_ENTITIES') {
        res += ': none';
    }
    return res;
}


export function getCraftable(bot) {
    const blocks = getNearbyBlocks(bot, 50);
    let table = null;
    for (const block of blocks) {
        if (block.name == 'crafting_table') {
            table = block;
            break;
        }
    }
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
