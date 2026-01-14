import * as skills from '../library/skills.js';
import settings from '../settings.js';
import convoManager from '../conversation.js';


function runAsAction (actionFn, resume = false, timeout = -1) {
    let actionLabel = null;  // Will be set on first use
    
    const wrappedAction = async function (agent, ...args) {
        // Set actionLabel only once, when the action is first created
        if (!actionLabel) {
            const actionObj = actionsList.find(a => a.perform === wrappedAction);
            actionLabel = actionObj.name.substring(1); // Remove the ! prefix
        }

        const actionFnWithAgent = async () => {
            await actionFn(agent, ...args);
        };
        const code_return = await agent.actions.runAction(`action:${actionLabel}`, actionFnWithAgent, { timeout, resume });
        if (code_return.interrupted && !code_return.timedout)
            return;
        return code_return.message;
    }

    return wrappedAction;
}

export const actionsList = [
    {
        name: '!newAction',
        description: 'Perform new and unknown custom behaviors that are not available as a command.', 
        params: {
            'prompt': { type: 'string', description: 'A natural language prompt to guide code generation. Make a detailed step-by-step plan.' }
        },
        perform: async function(agent, prompt) {
            // just ignore prompt - it is now in context in chat history
            if (!settings.allow_insecure_coding) { 
                agent.openChat('newAction is disabled. Enable with allow_insecure_coding=true in settings.js');
                return "newAction not allowed! Code writing is disabled in settings. Notify the user.";
            }
            let result = "";
            const actionFn = async () => {
                try {
                    result = await agent.coder.generateCode(agent.history);
                } catch (e) {
                    result = 'Error generating code: ' + e.toString();
                }
            };
            await agent.actions.runAction('action:newAction', actionFn, {timeout: settings.code_timeout_mins});
            return result;
        }
    },
    {
        name: '!stop',
        description: 'Force stop all actions and commands that are currently executing.',
        perform: async function (agent) {
            await agent.actions.stop();
            agent.clearBotLogs();
            agent.actions.cancelResume();
            agent.bot.emit('idle');
            let msg = 'Agent stopped.';
            if (agent.self_prompter.isActive())
                msg += ' Self-prompting still active.';
            return msg;
        }
    },
    {
        name: '!stfu',
        description: 'Stop all chatting and self prompting, but continue current action.',
        perform: async function (agent) {
            agent.openChat('Shutting up.');
            agent.shutUp();
            return;
        }
    },
    {
        name: '!restart',
        description: 'Restart the agent process.',
        perform: async function (agent) {
            agent.cleanKill();
        }
    },
    {
        name: '!clearChat',
        description: 'Clear the chat history.',
        perform: async function (agent) {
            agent.history.clear();
            return agent.name + "'s chat history was cleared, starting new conversation from scratch.";
        }
    },
    {
        name: '!goToPlayer',
        description: 'Go to the given player.',
        params: {
            'player_name': {type: 'string', description: 'The name of the player to go to.'},
            'closeness': {type: 'float', description: 'How close to get to the player.', domain: [0, Infinity]}
        },
        perform: runAsAction(async (agent, player_name, closeness) => {
            await skills.goToPlayer(agent.bot, player_name, closeness);
        })
    },
    {
        name: '!followPlayer',
        description: 'Endlessly follow the given player.',
        params: {
            'player_name': {type: 'string', description: 'name of the player to follow.'},
            'follow_dist': {type: 'float', description: 'The distance to follow from.', domain: [0, Infinity]}
        },
        perform: runAsAction(async (agent, player_name, follow_dist) => {
            await skills.followPlayer(agent.bot, player_name, follow_dist);
        }, true)
    },
    {
        name: '!goToCoordinates',
        description: 'Go to the given x, y, z location.',
        params: {
            'x': {type: 'float', description: 'The x coordinate.', domain: [-Infinity, Infinity]},
            'y': {type: 'float', description: 'The y coordinate.', domain: [-64, 320]},
            'z': {type: 'float', description: 'The z coordinate.', domain: [-Infinity, Infinity]},
            'closeness': {type: 'float', description: 'How close to get to the location.', domain: [0, Infinity]}
        },
        perform: runAsAction(async (agent, x, y, z, closeness) => {
            await skills.goToPosition(agent.bot, x, y, z, closeness);
        })
    },
    {
        name: '!searchForBlock',
        description: 'Find and go to the nearest block of a given type in a given range.',
        params: {
            'type': { type: 'BlockName', description: 'The block type to go to.' },
            'search_range': { type: 'float', description: 'The range to search for the block. Minimum 32.', domain: [10, 512] }
        },
        perform: runAsAction(async (agent, block_type, range) => {
            if (range < 32) {
                log(agent.bot, `Minimum search range is 32.`);
                range = 32;
            }
            await skills.goToNearestBlock(agent.bot, block_type, 4, range);
        })
    },
    {
        name: '!searchForEntity',
        description: 'Find and go to the nearest entity of a given type in a given range.',
        params: {
            'type': { type: 'string', description: 'The type of entity to go to.' },
            'search_range': { type: 'float', description: 'The range to search for the entity.', domain: [32, 512] }
        },
        perform: runAsAction(async (agent, entity_type, range) => {
            await skills.goToNearestEntity(agent.bot, entity_type, 4, range);
        })
    },
    {
        name: '!moveAway',
        description: 'Move away from the current location in any direction by a given distance.',
        params: {'distance': { type: 'float', description: 'The distance to move away.', domain: [0, Infinity] }},
        perform: runAsAction(async (agent, distance) => {
            await skills.moveAway(agent.bot, distance);
        })
    },
    {
        name: '!rememberHere',
        description: 'Save the current location with a given name.',
        params: {'name': { type: 'string', description: 'The name to remember the location as.' }},
        perform: async function (agent, name) {
            const pos = agent.bot.entity.position;
            agent.memory_bank.rememberPlace(name, pos.x, pos.y, pos.z);
            return `Location saved as "${name}".`;
        }
    },
    {
        name: '!goToRememberedPlace',
        description: 'Go to a saved location.',
        params: {'name': { type: 'string', description: 'The name of the location to go to.' }},
        perform: runAsAction(async (agent, name) => {
            const pos = agent.memory_bank.recallPlace(name);
            if (!pos) {
            skills.log(agent.bot, `No location named "${name}" saved.`);
            return;
            }
            await skills.goToPosition(agent.bot, pos[0], pos[1], pos[2], 1);
        })
    },
    {
        name: '!givePlayer',
        description: 'Give the specified item to the given player.',
        params: { 
            'player_name': { type: 'string', description: 'The name of the player to give the item to.' }, 
            'item_name': { type: 'ItemName', description: 'The name of the item to give.' },
            'num': { type: 'int', description: 'The number of items to give.', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: runAsAction(async (agent, player_name, item_name, num) => {
            await skills.giveToPlayer(agent.bot, item_name, player_name, num);
        })
    },
    {
        name: '!eat',
        description: 'Eat/drink the given item.',
        params: {'item_name': { type: 'ItemName', description: 'The name of the item to eat.' }},
        perform: runAsAction(async (agent, item_name) => {
            await skills.eat(agent.bot, item_name);
        })
    },
    {
        name: '!equip',
        description: 'Equip the given item.',
        params: {'item_name': { type: 'ItemName', description: 'The name of the item to equip.' }},
        perform: runAsAction(async (agent, item_name) => {
            await skills.equip(agent.bot, item_name);
        })
    },
    {
        name: '!putInChest',
        description: 'Put the given item in the nearest chest.',
        params: {
            'item_name': { type: 'ItemName', description: 'The name of the item to put in the chest.' },
            'num': { type: 'int', description: 'The number of items to put in the chest.', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: runAsAction(async (agent, item_name, num) => {
            await skills.putInChest(agent.bot, item_name, num);
        })
    },
    {
        name: '!takeFromChest',
        description: 'Take the given items from the nearest chest.',
        params: {
            'item_name': { type: 'ItemName', description: 'The name of the item to take.' },
            'num': { type: 'int', description: 'The number of items to take.', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: runAsAction(async (agent, item_name, num) => {
            await skills.takeFromChest(agent.bot, item_name, num);
        })
    },
    {
        name: '!viewChest',
        description: 'View the items/counts of the nearest chest.',
        params: { },
        perform: runAsAction(async (agent) => {
            await skills.viewChest(agent.bot);
        })
    },
    {
        name: '!discard',
        description: 'Discard the given item from the inventory.',
        params: {
            'item_name': { type: 'ItemName', description: 'The name of the item to discard.' },
            'num': { type: 'int', description: 'The number of items to discard.', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: runAsAction(async (agent, item_name, num) => {
            const start_loc = agent.bot.entity.position;
            await skills.moveAway(agent.bot, 5);
            await skills.discard(agent.bot, item_name, num);
            await skills.goToPosition(agent.bot, start_loc.x, start_loc.y, start_loc.z, 0);
        })
    },
    {
        name: '!collectBlocks',
        description: 'Collect the nearest blocks of a given type.',
        params: {
            'type': { type: 'BlockName', description: 'The block type to collect.' },
            'num': { type: 'int', description: 'The number of blocks to collect.', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: runAsAction(async (agent, type, num) => {
            await skills.collectBlock(agent.bot, type, num);
        }, false, 10) // 10 minute timeout
    },
    {
        name: '!craftRecipe',
        description: 'Craft the given recipe a given number of times. Will automatically create crafting table if needed.',
        params: {
            'recipe_name': { type: 'ItemName', description: 'The name of the output item to craft.' },
            'num': { type: 'int', description: 'The number of times to craft the recipe. This is NOT the number of output items, as it may craft many more items depending on the recipe.', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: runAsAction(async (agent, recipe_name, num) => {
            await skills.craftRecipe(agent.bot, recipe_name, num);
        })
    },
    {
        name: '!autoCraft',
        description: 'Automatically craft an item, handling the full crafting chain (logs -> planks -> sticks -> tools). Much smarter than !craftRecipe for complex items.',
        params: {
            'item_name': { type: 'ItemName', description: 'The name of the item to craft (e.g., wooden_pickaxe, stone_sword).' },
            'num': { type: 'int', description: 'The number of items to craft.', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: runAsAction(async (agent, item_name, num) => {
            const bot = agent.bot;
            const inventory = () => {
                const inv = {};
                for (const item of bot.inventory.items()) {
                    if (item) {
                        inv[item.name] = (inv[item.name] || 0) + item.count;
                    }
                }
                return inv;
            };
            
            // Define crafting chains for common items
            // Format: item_name -> [prerequisite steps..., final_item]
            // Steps: 'planks' = ensure planks, 'stick' = ensure sticks, 'crafting_table' = ensure table
            const craftingChains = {
                // ============ WOODEN TOOLS ============
                'wooden_pickaxe': ['planks', 'stick', 'crafting_table', 'wooden_pickaxe'],
                'wooden_axe': ['planks', 'stick', 'crafting_table', 'wooden_axe'],
                'wooden_sword': ['planks', 'stick', 'crafting_table', 'wooden_sword'],
                'wooden_shovel': ['planks', 'stick', 'crafting_table', 'wooden_shovel'],
                'wooden_hoe': ['planks', 'stick', 'crafting_table', 'wooden_hoe'],
                
                // ============ STONE TOOLS ============
                'stone_pickaxe': ['planks', 'stick', 'crafting_table', 'stone_pickaxe'],
                'stone_axe': ['planks', 'stick', 'crafting_table', 'stone_axe'],
                'stone_sword': ['planks', 'stick', 'crafting_table', 'stone_sword'],
                'stone_shovel': ['planks', 'stick', 'crafting_table', 'stone_shovel'],
                'stone_hoe': ['planks', 'stick', 'crafting_table', 'stone_hoe'],
                
                // ============ IRON TOOLS ============
                'iron_pickaxe': ['planks', 'stick', 'crafting_table', 'iron_pickaxe'],
                'iron_axe': ['planks', 'stick', 'crafting_table', 'iron_axe'],
                'iron_sword': ['planks', 'stick', 'crafting_table', 'iron_sword'],
                'iron_shovel': ['planks', 'stick', 'crafting_table', 'iron_shovel'],
                'iron_hoe': ['planks', 'stick', 'crafting_table', 'iron_hoe'],
                
                // ============ GOLD TOOLS ============
                'golden_pickaxe': ['planks', 'stick', 'crafting_table', 'golden_pickaxe'],
                'golden_axe': ['planks', 'stick', 'crafting_table', 'golden_axe'],
                'golden_sword': ['planks', 'stick', 'crafting_table', 'golden_sword'],
                'golden_shovel': ['planks', 'stick', 'crafting_table', 'golden_shovel'],
                'golden_hoe': ['planks', 'stick', 'crafting_table', 'golden_hoe'],
                
                // ============ DIAMOND TOOLS ============
                'diamond_pickaxe': ['planks', 'stick', 'crafting_table', 'diamond_pickaxe'],
                'diamond_axe': ['planks', 'stick', 'crafting_table', 'diamond_axe'],
                'diamond_sword': ['planks', 'stick', 'crafting_table', 'diamond_sword'],
                'diamond_shovel': ['planks', 'stick', 'crafting_table', 'diamond_shovel'],
                'diamond_hoe': ['planks', 'stick', 'crafting_table', 'diamond_hoe'],
                
                // ============ LEATHER ARMOR ============
                'leather_helmet': ['crafting_table', 'leather_helmet'],
                'leather_chestplate': ['crafting_table', 'leather_chestplate'],
                'leather_leggings': ['crafting_table', 'leather_leggings'],
                'leather_boots': ['crafting_table', 'leather_boots'],
                
                // ============ IRON ARMOR ============
                'iron_helmet': ['crafting_table', 'iron_helmet'],
                'iron_chestplate': ['crafting_table', 'iron_chestplate'],
                'iron_leggings': ['crafting_table', 'iron_leggings'],
                'iron_boots': ['crafting_table', 'iron_boots'],
                
                // ============ GOLD ARMOR ============
                'golden_helmet': ['crafting_table', 'golden_helmet'],
                'golden_chestplate': ['crafting_table', 'golden_chestplate'],
                'golden_leggings': ['crafting_table', 'golden_leggings'],
                'golden_boots': ['crafting_table', 'golden_boots'],
                
                // ============ DIAMOND ARMOR ============
                'diamond_helmet': ['crafting_table', 'diamond_helmet'],
                'diamond_chestplate': ['crafting_table', 'diamond_chestplate'],
                'diamond_leggings': ['crafting_table', 'diamond_leggings'],
                'diamond_boots': ['crafting_table', 'diamond_boots'],
                
                // ============ WEAPONS & COMBAT ============
                'bow': ['planks', 'stick', 'crafting_table', 'bow'],
                'arrow': ['planks', 'stick', 'crafting_table', 'arrow'],
                'crossbow': ['planks', 'stick', 'crafting_table', 'crossbow'],
                'shield': ['planks', 'crafting_table', 'shield'],
                
                // ============ BASIC ITEMS ============
                'crafting_table': ['planks', 'crafting_table'],
                'stick': ['planks', 'stick'],
                'torch': ['planks', 'stick', 'torch'],
                'chest': ['planks', 'crafting_table', 'chest'],
                'furnace': ['crafting_table', 'furnace'],
                'smoker': ['crafting_table', 'furnace', 'smoker'],
                'blast_furnace': ['crafting_table', 'furnace', 'blast_furnace'],
                
                // ============ BEDS (all colors) ============
                'white_bed': ['planks', 'crafting_table', 'white_bed'],
                'orange_bed': ['planks', 'crafting_table', 'orange_bed'],
                'magenta_bed': ['planks', 'crafting_table', 'magenta_bed'],
                'light_blue_bed': ['planks', 'crafting_table', 'light_blue_bed'],
                'yellow_bed': ['planks', 'crafting_table', 'yellow_bed'],
                'lime_bed': ['planks', 'crafting_table', 'lime_bed'],
                'pink_bed': ['planks', 'crafting_table', 'pink_bed'],
                'gray_bed': ['planks', 'crafting_table', 'gray_bed'],
                'light_gray_bed': ['planks', 'crafting_table', 'light_gray_bed'],
                'cyan_bed': ['planks', 'crafting_table', 'cyan_bed'],
                'purple_bed': ['planks', 'crafting_table', 'purple_bed'],
                'blue_bed': ['planks', 'crafting_table', 'blue_bed'],
                'brown_bed': ['planks', 'crafting_table', 'brown_bed'],
                'green_bed': ['planks', 'crafting_table', 'green_bed'],
                'red_bed': ['planks', 'crafting_table', 'red_bed'],
                'black_bed': ['planks', 'crafting_table', 'black_bed'],
                
                // ============ DOORS ============
                'oak_door': ['planks', 'crafting_table', 'oak_door'],
                'spruce_door': ['planks', 'crafting_table', 'spruce_door'],
                'birch_door': ['planks', 'crafting_table', 'birch_door'],
                'jungle_door': ['planks', 'crafting_table', 'jungle_door'],
                'acacia_door': ['planks', 'crafting_table', 'acacia_door'],
                'dark_oak_door': ['planks', 'crafting_table', 'dark_oak_door'],
                'iron_door': ['crafting_table', 'iron_door'],
                
                // ============ BOATS ============
                'oak_boat': ['planks', 'crafting_table', 'oak_boat'],
                'spruce_boat': ['planks', 'crafting_table', 'spruce_boat'],
                'birch_boat': ['planks', 'crafting_table', 'birch_boat'],
                'jungle_boat': ['planks', 'crafting_table', 'jungle_boat'],
                'acacia_boat': ['planks', 'crafting_table', 'acacia_boat'],
                'dark_oak_boat': ['planks', 'crafting_table', 'dark_oak_boat'],
                
                // ============ STORAGE & UTILITY ============
                'barrel': ['planks', 'crafting_table', 'barrel'],
                'composter': ['planks', 'crafting_table', 'composter'],
                'cartography_table': ['planks', 'crafting_table', 'cartography_table'],
                'fletching_table': ['planks', 'crafting_table', 'fletching_table'],
                'smithing_table': ['planks', 'crafting_table', 'smithing_table'],
                'loom': ['planks', 'crafting_table', 'loom'],
                'bookshelf': ['planks', 'crafting_table', 'bookshelf'],
                'ladder': ['planks', 'stick', 'crafting_table', 'ladder'],
                'fence': ['planks', 'stick', 'crafting_table', 'fence'],
                'fence_gate': ['planks', 'stick', 'crafting_table', 'fence_gate'],
                
                // ============ FOOD & FARMING ============
                'bread': ['crafting_table', 'bread'],
                'cake': ['crafting_table', 'cake'],
                'cookie': ['crafting_table', 'cookie'],
                'pumpkin_pie': ['crafting_table', 'pumpkin_pie'],
                
                // ============ RAILS & MINECARTS ============
                'rail': ['planks', 'stick', 'crafting_table', 'rail'],
                'powered_rail': ['planks', 'stick', 'crafting_table', 'powered_rail'],
                'detector_rail': ['crafting_table', 'detector_rail'],
                'activator_rail': ['planks', 'stick', 'crafting_table', 'activator_rail'],
                'minecart': ['crafting_table', 'minecart'],
                
                // ============ REDSTONE ============
                'piston': ['planks', 'crafting_table', 'piston'],
                'sticky_piston': ['crafting_table', 'sticky_piston'],
                'lever': ['planks', 'stick', 'lever'],
                'tripwire_hook': ['planks', 'stick', 'crafting_table', 'tripwire_hook'],
                'daylight_detector': ['crafting_table', 'daylight_detector'],
                'observer': ['crafting_table', 'observer'],
                'hopper': ['planks', 'crafting_table', 'hopper'],
                'dropper': ['crafting_table', 'dropper'],
                'dispenser': ['crafting_table', 'dispenser'],
                
                // ============ BLOCKS ============
                'cobblestone_slab': ['crafting_table', 'cobblestone_slab'],
                'stone_slab': ['crafting_table', 'stone_slab'],
                'brick': ['crafting_table', 'brick'],
                'bricks': ['crafting_table', 'bricks'],
                'stone_bricks': ['crafting_table', 'stone_bricks'],
                'glass_pane': ['crafting_table', 'glass_pane'],
                
                // ============ BUCKETS & TOOLS ============
                'bucket': ['crafting_table', 'bucket'],
                'compass': ['crafting_table', 'compass'],
                'clock': ['crafting_table', 'clock'],
                'map': ['crafting_table', 'map'],
                'shears': ['crafting_table', 'shears'],
                'fishing_rod': ['planks', 'stick', 'crafting_table', 'fishing_rod'],
                'flint_and_steel': ['crafting_table', 'flint_and_steel'],
                'lead': ['crafting_table', 'lead'],
                'name_tag': ['crafting_table', 'name_tag'],
                
                // ============ ENCHANTING & BREWING ============
                'enchanting_table': ['crafting_table', 'enchanting_table'],
                'anvil': ['crafting_table', 'anvil'],
                'brewing_stand': ['crafting_table', 'brewing_stand'],
                'cauldron': ['crafting_table', 'cauldron'],
            };
            
            // Helper to craft planks from any log type
            const craftPlanks = async () => {
                const inv = inventory();
                const logTypes = ['oak_log', 'spruce_log', 'birch_log', 'jungle_log', 
                                 'acacia_log', 'dark_oak_log', 'mangrove_log', 'cherry_log',
                                 'crimson_stem', 'warped_stem', 'stripped_oak_log', 'stripped_spruce_log',
                                 'stripped_birch_log', 'stripped_jungle_log', 'stripped_acacia_log',
                                 'stripped_dark_oak_log', 'stripped_mangrove_log', 'stripped_cherry_log'];
                
                for (const logType of logTypes) {
                    if ((inv[logType] || 0) > 0) {
                        const plankType = logType.replace('stripped_', '').replace('_log', '_planks').replace('_stem', '_planks');
                        console.log(`[AUTOCRAFT] Crafting ${plankType} from ${logType}`);
                        await skills.craftRecipe(bot, plankType, Math.min(inv[logType], 4));
                        return true;
                    }
                }
                return false;
            };
            
            // Check if we have enough planks, if not craft more
            const ensurePlanks = async (needed) => {
                let inv = inventory();
                const plankTypes = ['oak_planks', 'spruce_planks', 'birch_planks', 'jungle_planks', 
                                   'acacia_planks', 'dark_oak_planks', 'mangrove_planks', 'cherry_planks',
                                   'crimson_planks', 'warped_planks', 'bamboo_planks'];
                let totalPlanks = 0;
                for (const p of plankTypes) {
                    totalPlanks += inv[p] || 0;
                }
                
                while (totalPlanks < needed) {
                    const crafted = await craftPlanks();
                    if (!crafted) {
                        console.log(`[AUTOCRAFT] Cannot craft more planks, have ${totalPlanks}, need ${needed}`);
                        return false;
                    }
                    inv = inventory();
                    totalPlanks = 0;
                    for (const p of plankTypes) {
                        totalPlanks += inv[p] || 0;
                    }
                }
                return true;
            };
            
            // Check if we have sticks, if not craft them
            const ensureSticks = async (needed) => {
                let inv = inventory();
                if ((inv['stick'] || 0) >= needed) return true;
                
                // Need 2 planks per 4 sticks
                const sticksNeeded = needed - (inv['stick'] || 0);
                const planksNeeded = Math.ceil(sticksNeeded / 4) * 2;
                
                if (!await ensurePlanks(planksNeeded)) return false;
                
                await skills.craftRecipe(bot, 'stick', Math.ceil(sticksNeeded / 4));
                return true;
            };
            
            // Check if we have crafting table
            const ensureCraftingTable = async () => {
                const inv = inventory();
                if ((inv['crafting_table'] || 0) > 0) return true;
                
                // Need 4 planks for crafting table
                if (!await ensurePlanks(4)) return false;
                
                await skills.craftRecipe(bot, 'crafting_table', 1);
                return true;
            };
            
            console.log(`[AUTOCRAFT] Starting autoCraft for ${item_name} x${num}`);
            
            // Get the crafting chain if it exists
            const chain = craftingChains[item_name];
            
            if (chain) {
                // Execute each step in the chain
                for (const step of chain) {
                    console.log(`[AUTOCRAFT] Chain step: ${step}`);
                    if (step === 'planks') {
                        // For tools, we need: pickaxe/axe=5 planks(3+2sticks), sword=3 planks(1+2sticks), shovel=3 planks(1+2sticks)
                        if (!await ensurePlanks(8 * num)) {
                            console.log('[AUTOCRAFT] Failed to ensure planks');
                        }
                    } else if (step === 'stick') {
                        if (!await ensureSticks(4 * num)) {
                            console.log('[AUTOCRAFT] Failed to ensure sticks');
                        }
                    } else if (step === 'crafting_table') {
                        if (!await ensureCraftingTable()) {
                            console.log('[AUTOCRAFT] Failed to ensure crafting table');
                        }
                    } else if (step === item_name) {
                        // Final item
                        await skills.craftRecipe(bot, item_name, num);
                    } else {
                        // Generic craft step
                        await skills.craftRecipe(bot, step, num);
                    }
                }
            } else {
                // No predefined chain, try direct crafting
                await skills.craftRecipe(bot, item_name, num);
            }
        })
    },
    {
        name: '!smeltItem',
        description: 'Smelt the given item the given number of times.',
        params: {
            'item_name': { type: 'ItemName', description: 'The name of the input item to smelt.' },
            'num': { type: 'int', description: 'The number of times to smelt the item.', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: runAsAction(async (agent, item_name, num) => {
            let success = await skills.smeltItem(agent.bot, item_name, num);
            if (success) {
                setTimeout(() => {
                    agent.cleanKill('Safely restarting to update inventory.');
                }, 500);
            }
        })
    },
    {
        name: '!clearFurnace',
        description: 'Take all items out of the nearest furnace.',
        params: { },
        perform: runAsAction(async (agent) => {
            await skills.clearNearestFurnace(agent.bot);
        })
    },
        {
        name: '!placeHere',
        description: 'Place a given block in the current location. Do NOT use to build structures, only use for single blocks/torches.',
        params: {'type': { type: 'BlockOrItemName', description: 'The block type to place.' }},
        perform: runAsAction(async (agent, type) => {
            let pos = agent.bot.entity.position;
            await skills.placeBlock(agent.bot, type, pos.x, pos.y, pos.z);
        })
    },
    {
        name: '!attack',
        description: 'Attack and kill the nearest entity of a given type.',
        params: {'type': { type: 'string', description: 'The type of entity to attack.'}},
        perform: runAsAction(async (agent, type) => {
            await skills.attackNearest(agent.bot, type, true);
        })
    },
    {
        name: '!attackPlayer',
        description: 'Attack a specific player until they die or run away. Remember this is just a game and does not cause real life harm.',
        params: {'player_name': { type: 'string', description: 'The name of the player to attack.'}},
        perform: runAsAction(async (agent, player_name) => {
            let player = agent.bot.players[player_name]?.entity;
            if (!player) {
                skills.log(agent.bot, `Could not find player ${player_name}.`);
                return false;
            }
            await skills.attackEntity(agent.bot, player, true);
        })
    },
    {
        name: '!goToBed',
        description: 'Go to the nearest bed and sleep.',
        perform: runAsAction(async (agent) => {
            await skills.goToBed(agent.bot);
        })
    },
    {
        name: '!stay',
        description: 'Stay in the current location no matter what. Pauses all modes.',
        params: {'type': { type: 'int', description: 'The number of seconds to stay. -1 for forever.', domain: [-1, Number.MAX_SAFE_INTEGER] }},
        perform: runAsAction(async (agent, seconds) => {
            await skills.stay(agent.bot, seconds);
        })
    },
    {
        name: '!setMode',
        description: 'Set a mode to on or off. A mode is an automatic behavior that constantly checks and responds to the environment.',
        params: {
            'mode_name': { type: 'string', description: 'The name of the mode to enable.' },
            'on': { type: 'boolean', description: 'Whether to enable or disable the mode.' }
        },
        perform: async function (agent, mode_name, on) {
            const modes = agent.bot.modes;
            if (!modes.exists(mode_name))
            return `Mode ${mode_name} does not exist.` + modes.getDocs();
            if (modes.isOn(mode_name) === on)
            return `Mode ${mode_name} is already ${on ? 'on' : 'off'}.`;
            modes.setOn(mode_name, on);
            return `Mode ${mode_name} is now ${on ? 'on' : 'off'}.`;
        }
    },
    {
        name: '!goal',
        description: 'Set a goal prompt to endlessly work towards with continuous self-prompting.',
        params: {
            'selfPrompt': { type: 'string', description: 'The goal prompt.' },
        },
        perform: async function (agent, prompt) {
            if (convoManager.inConversation()) {
                agent.self_prompter.setPromptPaused(prompt);
            }
            else {
                agent.self_prompter.start(prompt);
            }
        }
    },
    {
        name: '!endGoal',
        description: 'Call when you have accomplished your goal. It will stop self-prompting and the current action. ',
        perform: async function (agent) {
            agent.self_prompter.stop();
            return 'Self-prompting stopped.';
        }
    },
    {
        name: '!showVillagerTrades',
        description: 'Show trades of a specified villager.',
        params: {'id': { type: 'int', description: 'The id number of the villager that you want to trade with.' }},
        perform: runAsAction(async (agent, id) => {
            await skills.showVillagerTrades(agent.bot, id);
        })
    },
    {
        name: '!tradeWithVillager',
        description: 'Trade with a specified villager.',
        params: {
            'id': { type: 'int', description: 'The id number of the villager that you want to trade with.' },
            'index': { type: 'int', description: 'The index of the trade you want executed (1-indexed).', domain: [1, Number.MAX_SAFE_INTEGER] },
            'count': { type: 'int', description: 'How many times that trade should be executed.', domain: [1, Number.MAX_SAFE_INTEGER] },
        },
        perform: runAsAction(async (agent, id, index, count) => {
            await skills.tradeWithVillager(agent.bot, id, index, count);
        })
    },
    {
        name: '!startConversation',
        description: 'Start a conversation with a bot. (FOR OTHER BOTS ONLY)',
        params: {
            'player_name': { type: 'string', description: 'The name of the player to send the message to.' },
            'message': { type: 'string', description: 'The message to send.' },
        },
        perform: async function (agent, player_name, message) {
            if (!convoManager.isOtherAgent(player_name))
                return player_name + ' is not a bot, cannot start conversation.';
            if (convoManager.inConversation() && !convoManager.inConversation(player_name)) 
                convoManager.forceEndCurrentConversation();
            else if (convoManager.inConversation(player_name))
                agent.history.add('system', 'You are already in conversation with ' + player_name + '. Don\'t use this command to talk to them.');
            convoManager.startConversation(player_name, message);
        }
    },
    {
        name: '!endConversation',
        description: 'End the conversation with the given bot. (FOR OTHER BOTS ONLY)',
        params: {
            'player_name': { type: 'string', description: 'The name of the player to end the conversation with.' }
        },
        perform: async function (agent, player_name) {
            if (!convoManager.inConversation(player_name))
                return `Not in conversation with ${player_name}.`;
            convoManager.endConversation(player_name);
            return `Converstaion with ${player_name} ended.`;
        }
    },
    {
        name: '!lookAtPlayer',
        description: 'Look at a player or look in the same direction as the player.',
        params: {
            'player_name': { type: 'string', description: 'Name of the target player' },
            'direction': {
                type: 'string',
                description: 'How to look ("at": look at the player, "with": look in the same direction as the player)',
            }
        },
        perform: async function(agent, player_name, direction) {
            if (direction !== 'at' && direction !== 'with') {
                return "Invalid direction. Use 'at' or 'with'.";
            }
            let result = "";
            const actionFn = async () => {
                result = await agent.vision_interpreter.lookAtPlayer(player_name, direction);
            };
            await agent.actions.runAction('action:lookAtPlayer', actionFn);
            return result;
        }
    },
    {
        name: '!lookAtPosition',
        description: 'Look at specified coordinates.',
        params: {
            'x': { type: 'int', description: 'x coordinate' },
            'y': { type: 'int', description: 'y coordinate' },
            'z': { type: 'int', description: 'z coordinate' }
        },
        perform: async function(agent, x, y, z) {
            let result = "";
            const actionFn = async () => {
                result = await agent.vision_interpreter.lookAtPosition(x, y, z);
            };
            await agent.actions.runAction('action:lookAtPosition', actionFn);
            return result;
        }
    },
    {
        name: '!digDown',
        description: 'Digs down a specified distance. Will stop if it reaches lava, water, or a fall of >=4 blocks below the bot.',
        params: {'distance': { type: 'int', description: 'Distance to dig down', domain: [1, Number.MAX_SAFE_INTEGER] }},
        perform: runAsAction(async (agent, distance) => {
            await skills.digDown(agent.bot, distance)
        })
    },
    {
        name: '!goToSurface',
        description: 'Moves the bot to the highest block above it (usually the surface).',
        params: {},
        perform: runAsAction(async (agent) => {
            await skills.goToSurface(agent.bot);
        })
    },
    {
        name: '!useOn',
        description: 'Use (right click) the given tool on the nearest target of the given type.',
        params: {
            'tool_name': { type: 'string', description: 'Name of the tool to use, or "hand" for no tool.' },
            'target': { type: 'string', description: 'The target as an entity type, block type, or "nothing" for no target.' }
        },
        perform: runAsAction(async (agent, tool_name, target) => {
            await skills.useToolOn(agent.bot, tool_name, target);
        })
    },
];
