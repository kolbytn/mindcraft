import * as mc from '../src/utils/mcdata.js';
import minecraftData from 'minecraft-data';

const mc_version = '1.21.1'
const mcdata = minecraftData(mc_version);
console.log(mcdata.recipes[mc.getItemId('white_dye')])
console.log(mcdata.recipes[mc.getItemId('oak_planks')])
console.log(mcdata.recipes[mc.getItemId('wooden_pickaxe')])
if (mcdata.recipes['minecraft:white_dye']) {
    console.log('Recipe found')
}
const target_item = 'white_dye'
const quantity = 1
const curr_inventory = {}
let craftingPlan = mc.getDetailedCraftingPlan(target_item, quantity, curr_inventory)
console.log(craftingPlan)