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

class MinecraftData {
    constructor() {
        this.mcdata = null;
        this.Item = null;

        this.server_version = null;
        this.server_port = null;
        this.server_host = null;
    }

    init(host, port, version) {
        this.server_version = version;
        this.server_port = port;
        this.server_host = host;
        
        this.mcdata = minecraftData(this.server_version);
        this.Item = prismarine_items(this.server_version);
    }

    initBot(username) {
        let bot = createBot({
            username: username,
            host: this.server_host,
            port: this.server_port,
            auth: settings.auth,
            version: this.server_version,
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

    isHuntable(mob) {
        if (!mob || !mob.name) return false;
        const animals = ['chicken', 'cow', 'llama', 'mooshroom', 'pig', 'rabbit', 'sheep'];
        return animals.includes(mob.name.toLowerCase()) && !mob.metadata[16]; // metadata 16 is not baby
    }

    isHostile(mob) {
        if (!mob || !mob.name) return false;
        return  (mob.type === 'mob' || mob.type === 'hostile') && mob.name !== 'iron_golem' && mob.name !== 'snow_golem';
    }

    getItemId(itemName) {
        let item = this.mcdata.itemsByName[itemName];
        if (item) {
            return item.id;
        }
        return null;
    }

    getItemName(itemId) {
        let item = this.mcdata.items[itemId]
        if (item) {
            return item.name;
        }
        return null;
    }

    getBlockId(blockName) {
        let block = this.mcdata.blocksByName[blockName];
        if (block) {
            return block.id;
        }
        return null;
    }

    getBlockName(blockId) {
        let block = this.mcdata.blocks[blockId]
        if (block) {
            return block.name;
        }
        return null;
    }

    getAllItems(ignore) {
        if (!ignore) {
            ignore = [];
        }
        let items = []
        for (const itemId in this.mcdata.items) {
            const item = this.mcdata.items[itemId];
            if (!ignore.includes(item.name)) {
                items.push(item);
            }
        }
        return items;
    }

    getAllItemIds(ignore) {
        const items = this.getAllItems(ignore);
        let itemIds = [];
        for (const item of items) {
            itemIds.push(item.id);
        }
        return itemIds;
    }

    getAllBlocks(ignore) {
        if (!ignore) {
            ignore = [];
        }
        let blocks = []
        for (const blockId in this.mcdata.blocks) {
            const block = this.mcdata.blocks[blockId];
            if (!ignore.includes(block.name)) {
                blocks.push(block);
            }
        }
        return blocks;
    }

    getAllBlockIds(ignore) {
        const blocks = this.getAllBlocks(ignore);
        let blockIds = [];
        for (const block of blocks) {
            blockIds.push(block.id);
        }
        return blockIds;
    }

    getAllBiomes() {
        return this.mcdata.biomes;
    }

    getItemCraftingRecipes(itemName) {
        let itemId = this.getItemId(itemName);
        if (!this.mcdata.recipes[itemId]) {
            return null;
        }

        let recipes = [];
        for (let r of this.mcdata.recipes[itemId]) {
            let recipe = {};
            let ingredients = [];
            if (r.ingredients) {
                ingredients = r.ingredients;
            } else if (r.inShape) {
                ingredients = r.inShape.flat();
            }
            for (let ingredient of ingredients) {
                let ingredientName = this.getItemName(ingredient);
                if (ingredientName === null) continue;
                if (!recipe[ingredientName])
                    recipe[ingredientName] = 0;
                recipe[ingredientName]++;
            }
            recipes.push(recipe);
        }

        return recipes;
    }

    isSmeltable(itemName) {
        const misc_smeltables = ['beef', 'chicken', 'cod', 'mutton', 'porkchop', 'rabbit', 'salmon', 'tropical_fish', 'potato', 'kelp', 'sand', 'cobblestone', 'clay_ball'];
        return itemName.includes('raw') || itemName.includes('log') || misc_smeltables.includes(itemName);
    }

    getSmeltingFuel(bot) {
        let fuel = bot.inventory.items().find(i => i.name === 'coal' || i.name === 'charcoal')
        if (fuel)
            return fuel;
        fuel = bot.inventory.items().find(i => i.name.includes('log') || i.name.includes('planks'))
        if (fuel)
            return fuel;
        return bot.inventory.items().find(i => i.name === 'coal_block' || i.name === 'lava_bucket');
    }

    getFuelSmeltOutput(fuelName) {
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

    getItemSmeltingIngredient(itemName) {
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

    getItemBlockSources(itemName) {
        let itemId = this.getItemId(itemName);
        let sources = [];
        for (let block of this.getAllBlocks()) {
            if (block.drops.includes(itemId)) {
                sources.push(block.name);
            }
        }
        return sources;
    }

    getItemAnimalSource(itemName) {
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

    getBlockTool(blockName) {
        let block = this.mcdata.blocksByName[blockName];
        if (!block || !block.harvestTools) {
            return null;
        }
        return this.getItemName(Object.keys(block.harvestTools)[0]);  // Double check first tool is always simplest
    }

    makeItem(name, amount=1) {
        return new this.Item(this.getItemId(name), amount);
    }

    /**
     * Returns the number of ingredients required to use the recipe once.
     * 
     * @param {Recipe} recipe
     * @returns {Object<mc.ItemName, number>} an object describing the number of each ingredient.
     */
    ingredientsFromPrismarineRecipe(recipe) {
        let requiredIngedients = {};
        if (recipe.inShape)
            for (const ingredient of recipe.inShape.flat()) {
                if(ingredient.id<0) continue; //prismarine-recipe uses id -1 as an empty crafting slot
                const ingredientName = this.getItemName(ingredient.id);
                requiredIngedients[ingredientName] ??=0;
                requiredIngedients[ingredientName] += ingredient.count;
            }
        if (recipe.ingredients)
            for (const ingredient of recipe.ingredients) {
                if(ingredient.id<0) continue;
                const ingredientName = this.getItemName(ingredient.id);
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
    calculateLimitingResource(availableItems, requiredItems, discrete=true) {
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

    /**
     * @typedef {string} ItemName
     * @typedef {string} BlockName
    */

    WOOD_TYPES = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak'];
    MATCHING_WOOD_BLOCKS = [
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
    WOOL_COLORS = [
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
}

export const mc = new MinecraftData();