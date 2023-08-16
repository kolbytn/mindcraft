import { getDocstrings } from './skills.js';


export function getStats(bot) {
    return "";
}


export function getInventory(bot) {
    return "";
}


export function getNearbyBlocks(bot) {
    return "";
}


export function getNearbyEntities(bot) {
    return "";
}


export function getNearbyPlayers(bot) {
    return "";
}


export function getCraftable(bot) {
    return "";
}


export function getSkills() {
    let res = '';
    let docs = getDocstrings();
    let lines = null;
    for (let i = 0; i < docs.length; i++) {
        lines = docs[i].trim().split('\n');
        res += lines[lines.length - 1] + '\n';
    }
    res = res.slice(0, res.length - 1);
    return res;
}


export function getDetailedSkills() {
    let res = 'namespace skills {';
    let docs = getDocstrings();
    for (let i = 0; i < docs.length; i++) {
        res += '\t' + docs[i] + '\n\n';
    }
    res += '}';
    return res;
}
