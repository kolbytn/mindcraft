import { readFileSync } from 'fs';

import { getNearbyBlocks } from './world.js';


export function getStats(bot) {
    return null;
}


export function getInventory(bot) {
    return null;
}


export function getBlocks(bot) {
    let res = 'NEARBY_BLOCKS\n';
    let blocks = getNearbyBlocks(bot);
    for (let i = 0; i < blocks.length; i++) {
        res += `- ${blocks[i]}\n`;
    }
    return res.trim();
}


export function getNearbyEntities(bot) {
    return null;
}


export function getNearbyPlayers(bot) {
    return null;
}


export function getCraftable(bot) {
    return null;
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
