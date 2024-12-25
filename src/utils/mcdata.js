import minecraftData from 'minecraft-data';
import settings from '../../settings.js';
import { createBot } from 'mineflayer';
import prismarine_items from 'prismarine-item';
import { pathfinder } from 'mineflayer-pathfinder';
import { plugin as pvp } from 'mineflayer-pvp';
import { plugin as collectblock } from 'mineflayer-collectblock';
import { plugin as autoEat } from 'mineflayer-auto-eat';
import plugin from 'mineflayer-armor-manager';
const armorManager = plugin;

const mc_version = settings.minecraft_version;
const mcdata = minecraftData(mc_version);
const Item = prismarine_items(mc_version);

/**
 * @typedef {string} ItemName
 * @typedef {string} BlockName
*/

export const WOOD_TYPES = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak'];
export const MATCHING_WOOD_BLOCKS = [
    'log',
    'planks',
    'sign',
    'boat',
    'fence_gate',
    'door',
    'fence',
    'slab',
    'stairs',
    'button',
    'pressure_plate',
    'trapdoor'
]
export const WOOL_COLORS = [
    'white',
    'orange',
    'magenta',
    'light_blue',
    'yellow',
    'lime',
    'pink',
    'gray',
    'light_gray',
    'cyan',
    'purple',
    'blue',
    'brown',
    'green',
    'red',
    'black'
]


export function initBot(username) {
    let bot = createBot({
        username: username,

        host: settings.host,
        port: settings.port,
        auth: settings.auth,

        version: mc_version,
    });
    bot.loadPlugin(pathfinder);
    bot.loadPlugin(pvp);
    bot.loadPlugin(collectblock);
    bot.loadPlugin(autoEat);
    bot.loadPlugin(armorManager); // auto equip armor
    bot.once('resourcePack', () => {
        bot.acceptResourcePack();
    });

    return bot;
}

export function isHuntable(mob) {
    if (!mob || !mob.name) return false;
    const animals = ['chicken', 'cow', 'llama', 'mooshroom', 'pig', 'rabbit', 'sheep'];
    return animals.includes(mob.name.toLowerCase()) && !mob.metadata[16]; // metadata 16 is not baby
}

export function isHostile(mob) {
    if (!mob || !mob.name) return false;
    return  (mob.type === 'mob' || mob.type === 'hostile') && mob.name !== 'iron_golem' && mob.name !== 'snow_golem';
}

export function getItemId(itemName) {
    let item = mcdata.itemsByName[itemName];
    if (item) {
        return item.id;
    }
    return null;
}

export function getItemName(itemId) {
    let item = mcdata.items[itemId]
    if (item) {
        return item.name;
    }
    return null;
}

export function getBlockId(blockName) {
    let block = mcdata.blocksByName[blockName];
    if (block) {
        return block.id;
    }
    return null;
}

export function getBlockName(blockId) {
    let block = mcdata.blocks[blockId]
    if (block) {
        return block.name;
    }
    return null;
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

export function getAllBiomes() {
    return mcdata.biomes;
}

export function getItemCraftingRecipes(itemName) {
    let itemId = getItemId(itemName);
    if (!mcdata.recipes[itemId]) {
        return null;
    }

    let recipes = [];
    for (let r of mcdata.recipes[itemId]) {
        let recipe = {};
        let ingredients = [];
        if (r.ingredients) {
            ingredients = r.ingredients;
        } else if (r.inShape) {
            ingredients = r.inShape.flat();
        }
        for (let ingredient of ingredients) {
            let ingredientName = getItemName(ingredient);
            if (ingredientName === null) continue;
            if (!recipe[ingredientName])
                recipe[ingredientName] = 0;
            recipe[ingredientName]++;
        }
        recipes.push([
            recipe,
            {craftedCount : r.result.count}
        ]);
    }

    return recipes;
}

export function isSmeltable(itemName) {
    const misc_smeltables = ['beef', 'chicken', 'cod', 'mutton', 'porkchop', 'rabbit', 'salmon', 'tropical_fish', 'potato', 'kelp', 'sand', 'cobblestone', 'clay_ball'];
    return itemName.includes('raw') || itemName.includes('log') || misc_smeltables.includes(itemName);
}

export function getSmeltingFuel(bot) {
    let fuel = bot.inventory.items().find(i => i.name === 'coal' || i.name === 'charcoal')
    if (fuel)
        return fuel;
    fuel = bot.inventory.items().find(i => i.name.includes('log') || i.name.includes('planks'))
    if (fuel)
        return fuel;
    return bot.inventory.items().find(i => i.name === 'coal_block' || i.name === 'lava_bucket');
}

export function getFuelSmeltOutput(fuelName) {
    if (fuelName === 'coal' || fuelName === 'charcoal')
        return 8;
    if (fuelName.includes('log') || fuelName.includes('planks'))
        return 1.5
    if (fuelName === 'coal_block')
        return 80;
    if (fuelName === 'lava_bucket')
        return 100;
    return 0;
}

export function getItemSmeltingIngredient(itemName) {
    return {    
        baked_potato: 'potato',
        steak: 'raw_beef',
        cooked_chicken: 'raw_chicken',
        cooked_cod: 'raw_cod',
        cooked_mutton: 'raw_mutton',
        cooked_porkchop: 'raw_porkchop',
        cooked_rabbit: 'raw_rabbit',
        cooked_salmon: 'raw_salmon',
        dried_kelp: 'kelp',
        iron_ingot: 'raw_iron',
        gold_ingot: 'raw_gold',
        copper_ingot: 'raw_copper',
        glass: 'sand'
    }[itemName];
}

export function getItemBlockSources(itemName) {
    let itemId = getItemId(itemName);
    let sources = [];
    for (let block of getAllBlocks()) {
        if (block.drops.includes(itemId)) {
            sources.push(block.name);
        }
    }
    return sources;
}

export function getItemAnimalSource(itemName) {
    return {    
        raw_beef: 'cow',
        raw_chicken: 'chicken',
        raw_cod: 'cod',
        raw_mutton: 'sheep',
        raw_porkchop: 'pig',
        raw_rabbit: 'rabbit',
        raw_salmon: 'salmon',
        leather: 'cow',
        wool: 'sheep'
    }[itemName];
}

export function getBlockTool(blockName) {
    let block = mcdata.blocksByName[blockName];
    if (!block || !block.harvestTools) {
        return null;
    }
    return getItemName(Object.keys(block.harvestTools)[0]);  // Double check first tool is always simplest
}

export function makeItem(name, amount=1) {
    return new Item(getItemId(name), amount);
}

/**
 * Returns the number of ingredients required to use the recipe once.
 * 
 * @param {Recipe} recipe
 * @returns {Object<mc.ItemName, number>} an object describing the number of each ingredient.
 */
export function ingredientsFromPrismarineRecipe(recipe) {
    let requiredIngedients = {};
    if (recipe.inShape)
        for (const ingredient of recipe.inShape.flat()) {
            if(ingredient.id<0) continue; //prismarine-recipe uses id -1 as an empty crafting slot
            const ingredientName = getItemName(ingredient.id);
            requiredIngedients[ingredientName] ??=0;
            requiredIngedients[ingredientName] += ingredient.count;
        }
    if (recipe.ingredients)
        for (const ingredient of recipe.ingredients) {
            if(ingredient.id<0) continue;
            const ingredientName = getItemName(ingredient.id);
            requiredIngedients[ingredientName] ??=0;
            requiredIngedients[ingredientName] -= ingredient.count;
            //Yes, the `-=` is intended.
            //prismarine-recipe uses positive numbers for the shaped ingredients but negative for unshaped.
            //Why this is the case is beyond my understanding.
        }
    return requiredIngedients;
}

/**
 * Calculates the number of times an action, such as a crafing recipe, can be completed before running out of resources.
 * @template T - doesn't have to be an item. This could be any resource.
 * @param {Object.<T, number>} availableItems - The resources available; e.g, `{'cobble_stone': 7, 'stick': 10}`
 * @param {Object.<T, number>} requiredItems - The resources required to complete the action once; e.g, `{'cobble_stone': 3, 'stick': 2}`
 * @param {boolean} discrete - Is the action discrete?
 * @returns {{num: number, limitingResource: (T | null)}} the number of times the action can be completed and the limmiting resource; e.g `{num: 2, limitingResource: 'cobble_stone'}`
 */
export function calculateLimitingResource(availableItems, requiredItems, discrete=true) {
    let limitingResource = null;
    let num = Infinity;
    for (const itemType in requiredItems) {
        if (availableItems[itemType] < requiredItems[itemType] * num) {
            limitingResource = itemType;
            num = availableItems[itemType] / requiredItems[itemType];
        }
    }
    if(discrete) num = Math.floor(num);
    return {num, limitingResource}
}

export function getDetailedCraftingPlan(currentInventory, targetItem, count = 1) {
    initializeLoopingItems();

    const missingItems = {};
    const craftingSteps = [];
    const remainingInventory = { ...currentInventory };
    const visited = new Set();

    // Helper function to check if we have enough of an item
    function checkInventory(item, neededCount) {
        const available = remainingInventory[item] || 0;
        if (available >= neededCount) {
            remainingInventory[item] = available - neededCount;
            return true;
        }
        return false;
    }

    // Helper function to add missing items
    function addMissingItem(item, count) {
        missingItems[item] = (missingItems[item] || 0) + count;
    }

    // Helper function to create a step key for aggregation
    function createStepKey(ingredients, output, craftedCount) {
        const sortedIngredients = Object.entries(ingredients)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([item, count]) => `${count} ${item}`)
            .join(" + ");
        return `${sortedIngredients} -> ${craftedCount} ${output}`;
    }

    function generateCraftingSteps(item, requiredCount, depth = 0) {
        // Check for looping items first
        if (loopingItems.has(item)) {
            if (!checkInventory(item, requiredCount)) { addMissingItem(item, requiredCount); }
            return;
        }
    
        // Check for cycles in recipe chain
        if (visited.has(item)) {
            if (!checkInventory(item, requiredCount)) { addMissingItem(item, requiredCount); }
            return;
        }
    
        visited.add(item);
    
        // First check if we already have enough of the item
        const neededFromCrafting = requiredCount;
        if (checkInventory(item, requiredCount)) {
            visited.delete(item);
            return;
        }
    
        const recipes = getItemCraftingRecipes(item);
        if (!recipes || recipes.length === 0) {
            addMissingItem(item, requiredCount);
            visited.delete(item);
            return;
        }
    
        // Get the first recipe assuming its the simplest
        const [ingredients, craftingInfo] = recipes[0];
        const craftedCount = craftingInfo.craftedCount;
        const batchesNeeded = Math.ceil(neededFromCrafting / craftedCount);
    
        // Add crafting step with the total batches needed
        const stepKey = createStepKey(ingredients, item, craftedCount);
        craftingSteps.push({
            depth,
            stepKey,
            input: ingredients,
            output: item,
            outputCount: craftedCount,
            batchesNeeded,
            recipe: ingredients
        });
    
        // Process each ingredient recursively
        for (const [ingredient, ingredientCount] of Object.entries(ingredients)) {
            const totalNeeded = ingredientCount * batchesNeeded;
            generateCraftingSteps(ingredient, totalNeeded, depth + 1);
        }
    
        visited.delete(item);
    }

    // Generate the complete crafting plan
    generateCraftingSteps(targetItem, count);

    // Format the response
    let response = "";
    
    const hasMissingItems = Object.keys(missingItems).length > 0;
    
    if (!hasMissingItems && craftingSteps.length === 0) {
        response += `You have all the items needed to craft ${targetItem}. `;
        const recipe = getItemCraftingRecipes(targetItem)[0][0];
        response += `Just combine ${Object.entries(recipe)
            .map(([item, count]) => `${count} ${item}`)
            .join(" + ")}.`;
    } else {
        if (hasMissingItems) {
            response += "You are missing the following items:\n";
            for (const [item, count] of Object.entries(missingItems)) {
                response += `- ${count} ${item}\n`;
            }
            response += "\nOnce you have these items, ";
        } else {
            response += "You have all the required materials. ";
        }
        
        if (craftingSteps.length > 0) {
            response += "Here's your crafting plan:\n\n";
            
            // Sort crafting steps by depth in reverse order
            craftingSteps.sort((a, b) => b.depth - a.depth);
            
            // Aggregate similar steps
            const stepCounts = new Map();
            craftingSteps.forEach(step => {
                stepCounts.set(step.stepKey, (stepCounts.get(step.stepKey) || 0) + step.batchesNeeded);
            });
            
            // Output aggregated steps
            const printedSteps = new Set();
            craftingSteps.forEach(step => {
                if (!printedSteps.has(step.stepKey)) {
                    const count = stepCounts.get(step.stepKey);
                    const times = count === 1 ? "time" : "times";
                    const inputs = Object.entries(step.input)
                        .map(([item, itemCount]) => `${itemCount} ${item}`)
                        .join(" + ");
                    response += `${count}x ${times} ${inputs} -> ${step.outputCount} ${step.output}\n`;
                    printedSteps.add(step.stepKey);
                }
            });
        }
    }

    return {
        canCraftNow: !hasMissingItems,
        missingItems,
        craftingSteps,
        response
    };
}

let loopingItems = new Set();

function detectLoopingItems() {
    const allItems = getAllItems();
    const loopingItemsSet = new Set();
    const problematicItems = [];

    // Helper function to detect if an item is part of a crafting loop
    function checkForLoop(item, visited = new Set()) {
        if (visited.has(item)) {
            return true;
        }
        visited.add(item);

        const recipes = getItemCraftingRecipes(item);
        if (!recipes || recipes.length === 0) {
            visited.delete(item);
            return false;
        }

        const [ingredients] = recipes[0];

        // Check each ingredient for loops
        for (const ingredient of Object.keys(ingredients)) {
            if (checkForLoop(ingredient, new Set(visited))) {
                loopingItemsSet.add(ingredient);
                return true;
            }
        }

        visited.delete(item);
        return false;
    }

    // Check each item for loops
    for (const item of allItems) {
        const recipes = getItemCraftingRecipes(item.name);
        if (!recipes || recipes.length === 0) {
            continue;
        }

        const [ingredients] = recipes[0];
        const problematicIngredients = [];

        for (const ingredient of Object.keys(ingredients)) {
            if (checkForLoop(ingredient, new Set())) {
                loopingItemsSet.add(ingredient);
                problematicIngredients.push(ingredient);
            }
        }

        if (problematicIngredients.length > 0) {
            problematicItems.push({
                item: item.name,
                recipe : recipes[0],
                problematicIngredients
            });
        }
    }

    return {
        loopingItems: Array.from(loopingItemsSet),
        problematicItems
    };
}

function initializeLoopingItems() {
    if (loopingItems.size === 0) {
        const { loopingItems: detectedLoopingItems } = detectLoopingItems();
        detectedLoopingItems.forEach(item => loopingItems.add(item));
    }
}