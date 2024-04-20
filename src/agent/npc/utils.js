import * as world from '../library/world.js';
import * as mc from '../../utils/mcdata.js';


export function getTypeOfGeneric(bot, block_name) {
    // Get type of wooden block
    if (mc.MATCHING_WOOD_BLOCKS.includes(block_name)) {

        // Return most common wood type in inventory
        let type_count = {};
        let max_count = 0;
        let max_type = null;
        let inventory = world.getInventoryCounts(bot);
        for (const item in inventory) {
            for (const wood of mc.WOOD_TYPES) {
                if (item.includes(wood)) {
                    if (type_count[wood] === undefined)
                        type_count[wood] = 0;
                    type_count[wood] += inventory[item];
                    if (type_count[wood] > max_count) {
                        max_count = type_count[wood];
                        max_type = wood;
                    }
                }
            }
        }
        if (max_type !== null)
            return max_type + '_' + block_name;

        // Return nearest wood type
        let log_types = mc.WOOD_TYPES.map((wood) => wood + '_log');
        let blocks = world.getNearestBlocks(bot, log_types, 16, 1);
        if (blocks.length > 0) {
            let wood = blocks[0].name.split('_')[0];
            return wood + '_' + block_name;
        }

        // Return oak
        return 'oak_' + block_name;
    }

    // Get type of bed
    if (block_name === 'bed') {

        // Return most common wool type in inventory
        let type_count = {};
        let max_count = 0;
        let max_type = null;
        let inventory = world.getInventoryCounts(bot);
        for (const item in inventory) {
            for (const color of mc.WOOL_COLORS) {
                if (item === color + '_wool') {
                    if (type_count[color] === undefined)
                        type_count[color] = 0;
                    type_count[color] += inventory[item];
                    if (type_count[color] > max_count) {
                        max_count = type_count[color];
                        max_type = color;
                    }
                }
            }
        }
        if (max_type !== null)
            return max_type + '_' + block_name;

        // Return white
        return 'white_' + block_name;
    }
    return block_name;
}


export function blockSatisfied(target_name, block) {
    if (target_name == 'dirt') {
        return block.name == 'dirt' || block.name == 'grass_block';
    } else if (mc.MATCHING_WOOD_BLOCKS.includes(target_name)) {
        return block.name.endsWith(target_name);
    } else if (target_name == 'bed') {
        return block.name.endsWith('bed');
    } else if (target_name == 'torch') {
        return block.name.includes('torch');
    }
    return block.name == target_name;
}


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


export function rotateXZ(x, z, orientation, sizex, sizez) {
    if (orientation === 0) return [x, z];
    if (orientation === 1) return [z, sizex-x-1];
    if (orientation === 2) return [sizex-x-1, sizez-z-1];
    if (orientation === 3) return [sizez-z-1, x];
}
