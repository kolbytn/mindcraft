import * as skills from './library/skills.js';
import * as world from './library/world.js';
import * as mc from '../utils/mcdata.js';
import settings from './settings.js';
import convoManager from './conversation.js';

async function say(agent, message) {
    agent.bot.modes.behavior_log += message + '\n';
    if (agent.shut_up || !settings.narrate_behavior) return;
    agent.openChat(message);
}

// a mode is a function that is called every tick to respond immediately to the world
// it has the following fields:
// on: whether 'update' is called every tick
// active: whether an action has been triggered by the mode and hasn't yet finished
// paused: whether the mode is paused by another action that overrides the behavior (eg followplayer implements its own self defense)
// update: the function that is called every tick (if on is true)
// when a mode is active, it will trigger an action to be performed but won't wait for it to return output

// the order of this list matters! first modes will be prioritized
// while update functions are async, they should *not* be awaited longer than ~100ms as it will block the update loop
// to perform longer actions, use the execute function which won't block the update loop
const modes_list = [
    {
        name: 'self_preservation',
        description: 'Respond to drowning, burning, and damage at low health. Interrupts all actions.',
        interrupts: ['all'],
        on: true,
        active: false,
        fall_blocks: ['sand', 'gravel', 'concrete_powder'], // includes matching substrings like 'sandstone' and 'red_sand'
        update: async function (agent) {
            const bot = agent.bot;
            let block = bot.blockAt(bot.entity.position);
            let blockAbove = bot.blockAt(bot.entity.position.offset(0, 1, 0));
            if (!block) block = {name: 'air'}; // hacky fix when blocks are not loaded
            if (!blockAbove) blockAbove = {name: 'air'};
            // Drowning prevention: swim up when underwater or low on air
            const isSubmerged = blockAbove.name === 'water';
            const oxygenLevel = bot.oxygenLevel != null ? bot.oxygenLevel : 20;
            if (isSubmerged && oxygenLevel < 12) {
                // Low on air — interrupt everything and swim to surface
                bot.setControlState('jump', true);
                bot.setControlState('sprint', false);
                if (oxygenLevel < 6) {
                    // Critical — also try to navigate up
                    await execute(this, agent, async () => {
                        const pos = bot.entity.position;
                        await skills.goToPosition(bot, pos.x, pos.y + 10, pos.z, 1);
                    });
                }
            }
            else if (isSubmerged) {
                // Underwater but air is okay — keep jumping to stay afloat
                bot.setControlState('jump', true);
            }
            else if (this.fall_blocks.some(name => blockAbove.name.includes(name))) {
                await execute(this, agent, async () => {
                    await skills.moveAway(bot, 2);
                });
            }
            else if (block.name === 'lava' || block.name === 'fire' ||
                blockAbove.name === 'lava' || blockAbove.name === 'fire') {
                await say(agent, 'I\'m on fire!');
                // if you have a water bucket, use it
                let waterBucket = bot.inventory.items().find(item => item.name === 'water_bucket');
                if (waterBucket) {
                    await execute(this, agent, async () => {
                        let success = await skills.placeBlock(bot, 'water_bucket', block.position.x, block.position.y, block.position.z);
                        if (success) void say(agent, 'Placed some water, ahhhh that\'s better!');
                    });
                }
                else {
                    await execute(this, agent, async () => {
                        let waterBucket = bot.inventory.items().find(item => item.name === 'water_bucket');
                        if (waterBucket) {
                            let success = await skills.placeBlock(bot, 'water_bucket', block.position.x, block.position.y, block.position.z);
                            if (success) void say(agent, 'Placed some water, ahhhh that\'s better!');
                            return;
                        }
                        let nearestWater = world.getNearestBlock(bot, 'water', 20);
                        if (nearestWater) {
                            const pos = nearestWater.position;
                            let success = await skills.goToPosition(bot, pos.x, pos.y, pos.z, 0.2);
                            if (success) void say(agent, 'Found some water, ahhhh that\'s better!');
                            return;
                        }
                        await skills.moveAway(bot, 5);
                    });
                }
            }
            else if (Date.now() - bot.lastDamageTime < 3000 && (bot.health < 5 || bot.lastDamageTaken >= bot.health)) {
                await say(agent, 'I\'m dying!');
                await execute(this, agent, async () => {
                    await skills.moveAway(bot, 20);
                });
            }
            else if (agent.isIdle()) {
                bot.clearControlStates(); // clear jump if not in danger or doing anything else
            }
        }
    },
    {
        name: 'unstuck',
        description: 'Attempt to get unstuck when in the same place for a while. Interrupts some actions.',
        interrupts: ['all'],
        on: true,
        active: false,
        prev_location: null,
        distance: 2,
        stuck_time: 0,
        last_time: Date.now(),
        max_stuck_time: 20,
        prev_dig_block: null,
        update: async function (agent) {
            if (agent.isIdle()) { 
                this.prev_location = null;
                this.stuck_time = 0;
                return; // don't get stuck when idle
            }
            const bot = agent.bot;
            const cur_dig_block = bot.targetDigBlock;
            if (cur_dig_block && !this.prev_dig_block) {
                this.prev_dig_block = cur_dig_block;
            }
            if (this.prev_location && this.prev_location.distanceTo(bot.entity.position) < this.distance && cur_dig_block == this.prev_dig_block) {
                this.stuck_time += (Date.now() - this.last_time) / 1000;
            }
            else {
                this.prev_location = bot.entity.position.clone();
                this.stuck_time = 0;
                this.prev_dig_block = null;
            }
            const max_stuck_time = cur_dig_block?.name === 'obsidian' ? this.max_stuck_time * 2 : this.max_stuck_time;
            if (this.stuck_time > max_stuck_time) {
                await say(agent, 'I\'m stuck!');
                this.stuck_time = 0;
                await execute(this, agent, async () => {
                    const crashTimeout = setTimeout(() => { agent.cleanKill("Got stuck and couldn't get unstuck") }, 30000);
                    try {
                        await skills.moveAway(bot, 5);
                        clearTimeout(crashTimeout);
                        void say(agent, 'I\'m free.');
                    } catch (moveErr) {
                        console.warn(`[Unstuck] moveAway failed: ${moveErr.message}. Brute-force walking...`);
                        // Brute-force fallback: random yaw + forward + jump for 3s
                        const randomYaw = Math.random() * Math.PI * 2;
                        const randomPitch = 0;
                        bot.look(randomYaw, randomPitch, true);
                        bot.setControlState('forward', true);
                        bot.setControlState('jump', true);
                        bot.setControlState('sprint', true);
                        await new Promise(resolve => setTimeout(resolve, 3000));
                        bot.clearControlStates();
                        clearTimeout(crashTimeout);
                        void say(agent, 'Broke free by brute force.');
                    }
                });
            }
            this.last_time = Date.now();
        },
        unpause: function () {
            this.prev_location = null;
            this.stuck_time = 0;
            this.prev_dig_block = null;
        }
    },
    {
        name: 'cowardice',
        description: 'Run away from enemies. Interrupts all actions.',
        interrupts: ['all'],
        on: true,
        active: false,
        update: async function (agent) {
            const enemy = world.getNearestEntityWhere(agent.bot, entity => mc.isHostile(entity), 16);
            if (enemy && await world.isClearPath(agent.bot, enemy)) {
                await say(agent, `Aaa! A ${enemy.name.replace("_", " ")}!`);
                await execute(this, agent, async () => {
                    await skills.avoidEnemies(agent.bot, 24);
                });
            }
        }
    },
    {
        name: 'self_defense',
        description: 'Attack nearby enemies. Interrupts all actions.',
        interrupts: ['all'],
        on: true,
        active: false,
        update: async function (agent) {
            const bot = agent.bot;
            if (Date.now() - (bot.respawnTime || 0) < 5000) return;
            const enemy = world.getNearestEntityWhere(bot, entity => mc.isHostile(entity), 8);
            if (enemy && await world.isClearPath(bot, enemy)) {
                await say(agent, `Fighting ${enemy.name}!`);
                await execute(this, agent, async () => {
                    await skills.defendSelf(agent.bot, 8);
                });
            }
        }
    },
    {
        name: 'hunting',
        description: 'Hunt nearby animals when idle.',
        interrupts: ['action:followPlayer'],
        on: true,
        active: false,
        update: async function (agent) {
            const huntable = world.getNearestEntityWhere(agent.bot, entity => mc.isHuntable(entity), 8);
            if (huntable && await world.isClearPath(agent.bot, huntable)) {
                await execute(this, agent, async () => {
                    void say(agent, `Hunting ${huntable.name}!`);
                    await skills.attackEntity(agent.bot, huntable);
                });
            }
        }
    },
    {
        name: 'item_collecting',
        description: 'Collect nearby items when idle.',
        interrupts: ['action:followPlayer'],
        on: true,
        active: false,

        wait: 2, // number of seconds to wait after noticing an item to pick it up
        prev_item: null,
        noticed_at: -1,
        update: async function (agent) {
            let item = world.getNearestEntityWhere(agent.bot, entity => entity.name === 'item', 8);
            let empty_inv_slots = agent.bot.inventory.emptySlotCount();
            if (item && item !== this.prev_item && await world.isClearPath(agent.bot, item) && empty_inv_slots > 1) {
                if (this.noticed_at === -1) {
                    this.noticed_at = Date.now();
                }
                if (Date.now() - this.noticed_at > this.wait * 1000) {
                    await say(agent, `Picking up item!`);
                    this.prev_item = item;
                    await execute(this, agent, async () => {
                        await skills.pickupNearbyItems(agent.bot);
                    });
                    this.noticed_at = -1;
                }
            }
            else {
                this.noticed_at = -1;
            }
        }
    },
    {
        name: 'torch_placing',
        description: 'Place torches when idle and there are no torches nearby.',
        interrupts: ['action:followPlayer'],
        on: true,
        active: false,
        cooldown: 5,
        last_place: Date.now(),
        update: async function (agent) {
            if (world.shouldPlaceTorch(agent.bot)) {
                if (Date.now() - this.last_place < this.cooldown * 1000) return;
                await execute(this, agent, async () => {
                    const pos = agent.bot.entity.position;
                    await skills.placeBlock(agent.bot, 'torch', pos.x, pos.y, pos.z, 'bottom', true);
                });
                this.last_place = Date.now();
            }
        }
    },
    {
        // RC26: Auto-navigate to bed and sleep at night
        name: 'night_bed',
        description: 'Automatically find and sleep in a bed at night. Crafts and places a bed if none nearby.',
        interrupts: ['action:followPlayer'],
        on: true,
        active: false,
        cooldown: 30,       // seconds between attempts
        lastAttempt: 0,
        update: async function (agent) {
            const bot = agent.bot;
            const time = bot.time?.timeOfDay ?? 0;

            // Only trigger at night (12500 = dusk, can sleep at 12542+)
            if (time < 12500 || time > 23000) return;
            // Already sleeping
            if (bot.isSleeping) return;
            // Cooldown to avoid spamming
            if (Date.now() - this.lastAttempt < this.cooldown * 1000) return;
            // Don't interrupt Nether/End (no night cycle)
            const dim = bot.game?.dimension;
            if (dim === 'the_nether' || dim === 'the_end') return;

            this.lastAttempt = Date.now();

            await execute(this, agent, async () => {
                // Phase 1: Look for existing bed within 64 blocks
                const beds = bot.findBlocks({
                    matching: (block) => block.name.includes('bed'),
                    maxDistance: 64,
                    count: 1
                });

                if (beds.length > 0) {
                    void say(agent, 'Night time — heading to bed.');
                    const success = await skills.goToBed(bot);
                    if (success) return;
                    // goToBed failed — fall through to craft attempt
                }

                // Phase 2: No bed found (or sleep failed) — try to craft and place one
                const inv = world.getInventoryCounts(bot);
                const woolTypes = [
                    'white_wool', 'orange_wool', 'magenta_wool', 'light_blue_wool',
                    'yellow_wool', 'lime_wool', 'pink_wool', 'gray_wool',
                    'light_gray_wool', 'cyan_wool', 'purple_wool', 'blue_wool',
                    'brown_wool', 'green_wool', 'red_wool', 'black_wool'
                ];
                const plankTypes = [
                    'oak_planks', 'spruce_planks', 'birch_planks', 'jungle_planks',
                    'acacia_planks', 'dark_oak_planks', 'mangrove_planks',
                    'cherry_planks', 'bamboo_planks', 'crimson_planks', 'warped_planks'
                ];

                const woolCount = woolTypes.reduce((sum, w) => sum + (inv[w] || 0), 0);
                const plankCount = plankTypes.reduce((sum, p) => sum + (inv[p] || 0), 0);

                if (woolCount >= 3 && plankCount >= 3) {
                    void say(agent, 'No bed nearby — crafting one.');
                    try {
                        // Find which wool and plank type we actually have
                        const woolType = woolTypes.find(w => (inv[w] || 0) >= 3)
                            || woolTypes.find(w => (inv[w] || 0) > 0);
                        // craftRecipe will try the default bed recipe
                        const bedName = woolType ? woolType.replace('_wool', '_bed') : 'white_bed';
                        await skills.craftRecipe(bot, bedName);

                        // Place the bed
                        const bedItem = bot.inventory.items().find(i => i.name.includes('bed'));
                        if (bedItem) {
                            const pos = bot.entity.position;
                            await skills.placeBlock(bot, bedItem.name, pos.x + 1, pos.y, pos.z, 'bottom');
                            // Now sleep in it
                            await skills.goToBed(bot);
                        }
                    } catch (err) {
                        console.log(`[night_bed] Craft/place failed: ${err.message}`);
                    }
                } else {
                    // Not enough materials — just log once quietly
                    console.log('[night_bed] No bed nearby and insufficient materials to craft one.');
                }
            });
        }
    },
    {
        name: 'elbow_room',
        description: 'Move away from nearby players when idle.',
        interrupts: ['action:followPlayer'],
        on: true,
        active: false,
        distance: 0.5,
        update: async function (agent) {
            const player = world.getNearestEntityWhere(agent.bot, entity => entity.type === 'player', this.distance);
            if (player) {
                await execute(this, agent, async () => {
                    // wait a random amount of time to avoid identical movements with other bots
                    const wait_time = Math.random() * 1000;
                    await new Promise(resolve => setTimeout(resolve, wait_time));
                    if (player.position.distanceTo(agent.bot.entity.position) < this.distance) {
                        await skills.moveAwayFromEntity(agent.bot, player, this.distance);
                    }
                });
            }
        }
    },
    {
        name: 'idle_staring',
        description: 'Animation to look around at entities when idle.',
        interrupts: [],
        on: true,
        active: false,

        staring: false,
        last_entity: null,
        next_change: 0,
        update: function (agent) {
            const entity = agent.bot.nearestEntity();
            let entity_in_view = entity && entity.position.distanceTo(agent.bot.entity.position) < 10 && entity.name !== 'enderman';
            if (entity_in_view && entity !== this.last_entity) {
                this.staring = true;
                this.last_entity = entity;
                this.next_change = Date.now() + Math.random() * 1000 + 4000;
            }
            if (entity_in_view && this.staring) {
                let isbaby = entity.type !== 'player' && entity.metadata[16];
                let height = isbaby ? entity.height/2 : entity.height;
                agent.bot.lookAt(entity.position.offset(0, height, 0));
            }
            if (!entity_in_view)
                this.last_entity = null;
            if (Date.now() > this.next_change) {
                // look in random direction
                this.staring = Math.random() < 0.3;
                if (!this.staring) {
                    const yaw = Math.random() * Math.PI * 2;
                    const pitch = (Math.random() * Math.PI/2) - Math.PI/4;
                    agent.bot.look(yaw, pitch, false);
                }
                this.next_change = Date.now() + Math.random() * 10000 + 2000;
            }
        }
    },
    {
        name: 'auto_eat',
        description: 'Automatically eat food when hunger drops below 14 or health drops below 50%. Prioritizes golden apples at critical health. Interrupts non-critical actions.',
        interrupts: ['all'],
        on: true,
        active: false,
        lastEat: 0,
        update: async function (agent) {
            const bot = agent.bot;
            // RC30: Hunger safety net — force eat when health < 50% regardless of hunger
            const healthCritical = bot.health < 10;
            if (bot.food >= 14 && !healthCritical) return;
            if (Date.now() - this.lastEat < (healthCritical ? 3000 : 10000)) return; // faster cooldown when health critical

            // RC30: Prioritize golden apples when health is critical
            const criticalFoodPriority = [
                'enchanted_golden_apple', 'golden_apple',
                'cooked_beef', 'cooked_porkchop', 'cooked_mutton', 'cooked_chicken',
                'cooked_salmon', 'cooked_cod', 'cooked_rabbit', 'bread', 'baked_potato',
                'apple', 'carrot', 'melon_slice', 'sweet_berries',
                'beef', 'porkchop', 'mutton', 'chicken', 'dried_kelp', 'rotten_flesh'
            ];
            const normalFoodPriority = [
                'cooked_beef', 'cooked_porkchop', 'cooked_mutton', 'cooked_chicken',
                'cooked_salmon', 'cooked_cod', 'cooked_rabbit', 'bread', 'baked_potato',
                'golden_apple', 'apple', 'carrot', 'melon_slice', 'sweet_berries',
                'beef', 'porkchop', 'mutton', 'chicken', 'dried_kelp', 'rotten_flesh'
            ];
            const foodPriority = healthCritical ? criticalFoodPriority : normalFoodPriority;

            const inv = world.getInventoryCounts(bot);
            let foodItem = null;
            for (const f of foodPriority) {
                if ((inv[f] || 0) > 0) { foodItem = f; break; }
            }

            if (foodItem) {
                this.lastEat = Date.now();
                await say(agent, healthCritical
                    ? `Emergency eating ${foodItem}! (health: ${bot.health.toFixed(1)}, hunger: ${bot.food})`
                    : `Eating ${foodItem} (hunger: ${bot.food}).`);
                await execute(this, agent, async () => {
                    await skills.consume(agent.bot, foodItem);
                });
            }
        }
    },
    {
        name: 'panic_defense',
        description: 'Build emergency cobblestone shelter when health is critically low (< 6) and under attack.',
        interrupts: ['all'],
        on: true,
        active: false,
        lastPanic: 0,
        update: async function (agent) {
            const bot = agent.bot;
            if (bot.health >= 6) return;
            if (Date.now() - this.lastPanic < 60000) return; // 60s cooldown
            if (Date.now() - bot.lastDamageTime > 5000) return; // only if recently damaged

            const inv = world.getInventoryCounts(bot);
            const cobble = (inv['cobblestone'] || 0);
            if (cobble < 12) return; // not enough to bother

            this.lastPanic = Date.now();
            await say(agent, 'Critical health! Building emergency shelter!');
            await execute(this, agent, async () => {
                await skills.buildPanicRoom(agent.bot);
            });
        }
    },
    {
        name: 'cheat',
        description: 'Use cheats to instantly place blocks and teleport.',
        interrupts: [],
        on: false,
        active: false,
        update: function (_agent) { /* do nothing */ }
    }
];

async function execute(mode, agent, func, timeout=-1) {
    if (agent.self_prompter.isActive())
        agent.self_prompter.stopLoop();
    let interrupted_action = agent.actions.currentActionLabel;
    mode.active = true;
    let code_return = await agent.actions.runAction(`mode:${mode.name}`, async () => {
        await func();
    }, { timeout });
    mode.active = false;
    console.log(`Mode ${mode.name} finished executing, code_return: ${code_return.message}`);

    let should_reprompt = 
        interrupted_action && // it interrupted a previous action
        !agent.actions.resume_func && // there is no resume function
        !agent.self_prompter.isActive() && // self prompting is not on
        !code_return.interrupted; // this mode action was not interrupted by something else

    if (should_reprompt) {
        // auto prompt to respond to the interruption
        let role = convoManager.inConversation() ? agent.last_sender : 'system';
        let logs = agent.bot.modes.flushBehaviorLog();
        agent.handleMessage(role, `(AUTO MESSAGE)Your previous action '${interrupted_action}' was interrupted by ${mode.name}.
        Your behavior log: ${logs}\nRespond accordingly.`);
    }
}

let _agent = null;
const modes_map = {};
for (let mode of modes_list) {
    modes_map[mode.name] = mode;
}

class ModeController {
    /*
    SECURITY WARNING:
    ModesController must be reference isolated. Do not store references to external objects like `agent`.
    This object is accessible by LLM generated code, so any stored references are also accessible.
    This can be used to expose sensitive information by malicious prompters.
    */
    constructor() {
        this.behavior_log = '';
    }

    exists(mode_name) {
        return modes_map[mode_name] != null;
    }

    setOn(mode_name, on) {
        modes_map[mode_name].on = on;
    }

    isOn(mode_name) {
        return modes_map[mode_name].on;
    }

    pause(mode_name) {
        modes_map[mode_name].paused = true;
    }

    unpause(mode_name) {
        const mode = modes_map[mode_name];
        //if  unpause func is defined and mode is currently paused
        if (mode.unpause && mode.paused) {
            mode.unpause();
        }
        mode.paused = false;
    }

    unPauseAll() {
        for (let mode of modes_list) {
            if (mode.paused) console.log(`Unpausing mode ${mode.name}`);
            this.unpause(mode.name);
        }
    }

    getMiniDocs() { // no descriptions
        let res = 'Agent Modes:';
        for (let mode of modes_list) {
            let on = mode.on ? 'ON' : 'OFF';
            res += `\n- ${mode.name}(${on})`;
        }
        return res;
    }

    getDocs() {
        let res = 'Agent Modes:';
        for (let mode of modes_list) {
            let on = mode.on ? 'ON' : 'OFF';
            res += `\n- ${mode.name}(${on}): ${mode.description}`;
        }
        return res;
    }

    async update() {
        if (_agent.isIdle()) {
            this.unPauseAll();
        }
        for (let mode of modes_list) {
            let interruptible = mode.interrupts.some(i => i === 'all') || mode.interrupts.some(i => i === _agent.actions.currentActionLabel);
            if (mode.on && !mode.paused && !mode.active && (_agent.isIdle() || interruptible)) {
                try {
                    await mode.update(_agent);
                } catch (err) {
                    console.error(`Mode ${mode.name} error:`, err.message);
                    mode.active = false;
                }
            }
            if (mode.active) break;
        }
    }

    flushBehaviorLog() {
        const log = this.behavior_log;
        this.behavior_log = '';
        return log;
    }

    getJson() {
        let res = {};
        for (let mode of modes_list) {
            res[mode.name] = mode.on;
        }
        return res;
    }

    loadJson(json) {
        for (let mode of modes_list) {
            if (json[mode.name] != undefined) {
                mode.on = json[mode.name];
            }
        }
    }
}

export function initModes(agent) {
    _agent = agent;
    // the mode controller is added to the bot object so it is accessible from anywhere the bot is used
    agent.bot.modes = new ModeController();
    if (agent.task) {
        agent.bot.restrict_to_inventory = agent.task.restrict_to_inventory;
    }
    let modes_json = agent.prompter.getInitModes();
    if (modes_json) {
        agent.bot.modes.loadJson(modes_json);
    }
}
