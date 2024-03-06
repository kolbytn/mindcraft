import * as skills from '../library/skills.js';
import * as world from '../library/world.js';
import * as mc from '../../utils/mcdata.js';


export function itemSatisfied(bot, item, quantity=1) {
    let qualifying = [item];
    if (item.includes('pickaxe') || 
            item.includes('axe') || 
            item.includes('shovel') ||
            item.includes('hoe') ||
            item.includes('sword')) {
        let material = item.split('_')[0];
        let type = item.split('_')[1];
        if (material === 'wooden') {
            qualifying.push('stone_' + type);
            qualifying.push('iron_' + type);
            qualifying.push('gold_' + type);
            qualifying.push('diamond_' + type);
        } else if (material === 'stone') {
            qualifying.push('iron_' + type);
            qualifying.push('gold_' + type);
            qualifying.push('diamond_' + type);
        } else if (material === 'iron') {
            qualifying.push('gold_' + type);
            qualifying.push('diamond_' + type);
        } else if (material === 'gold') {
            qualifying.push('diamond_' + type);
        }
    }
    for (let item of qualifying) {
        if (world.getInventoryCounts(bot)[item] >= quantity) {
            return true;
        }
    }
    return false;
}
