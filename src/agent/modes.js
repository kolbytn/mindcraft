import * as skills from './library/skills.js';
import * as world from './library/world.js';
import * as mc from '../utils/mcdata.js';
import settings from './settings.js'
import convoManager from './conversation.js';

async function say(agent, message) {
    agent.bot.modes.behavior_log += message + '\n';
    if (agent.shut_up || !settings.narrate_behavior) return;
    agent.openChat(message);
}

// Helper: Check if it's nighttime in Minecraft (13000-23000 ticks or monsters spawning)
function isNightTime(bot) {
    const time = bot.time.timeOfDay;
    return time >= 13000 && time <= 23000;
}

// Helper: Get best food item from inventory (prioritizes saturation)
function getBestFood(bot) {
    const validFoods = [
        'golden_apple', 'enchanted_golden_apple', 'cooked_beef', 'cooked_porkchop', 
        'cooked_mutton', 'cooked_salmon', 'cooked_chicken', 'cooked_rabbit', 'cooked_cod',
        'bread', 'baked_potato', 'pumpkin_pie', 'golden_carrot', 'apple', 'carrot',
        'melon_slice', 'sweet_berries', 'glow_berries', 'cookie', 'beetroot', 
        'dried_kelp', 'raw_beef', 'raw_porkchop', 'raw_mutton', 'raw_chicken', 
        'raw_rabbit', 'raw_salmon', 'raw_cod', 'potato', 'rotten_flesh'
    ];
    
    for (const foodName of validFoods) {
        const food = bot.inventory.items().find(item => item.name === foodName);
        if (food) return food;
    }
    return null;
}

// Helper: Get safest escape direction (away from enemies, towards light/open areas)
function getSafeEscapePosition(bot, enemies, distance = 24) {
    const pos = bot.entity.position;
    let bestDir = null;
    let bestScore = -Infinity;
    
    // Check 8 directions
    const directions = [
        [1, 0], [-1, 0], [0, 1], [0, -1],
        [1, 1], [1, -1], [-1, 1], [-1, -1]
    ];
    
    for (const [dx, dz] of directions) {
        const targetPos = pos.offset(dx * distance, 0, dz * distance);
        let score = 0;
        
        // Score based on distance from enemies
        for (const enemy of enemies) {
            if (enemy && enemy.position) {
                score += targetPos.distanceTo(enemy.position);
            }
        }
        
        // Prefer positions with solid ground
        const groundBlock = bot.blockAt(targetPos.offset(0, -1, 0));
        if (groundBlock && groundBlock.name !== 'air' && groundBlock.name !== 'water' && groundBlock.name !== 'lava') {
            score += 50;
        }
        
        // Avoid lava/water
        const targetBlock = bot.blockAt(targetPos);
        if (targetBlock && (targetBlock.name === 'lava' || targetBlock.name === 'water')) {
            score -= 1000;
        }
        
        if (score > bestScore) {
            bestScore = score;
            bestDir = { x: targetPos.x, y: targetPos.y, z: targetPos.z };
        }
    }
    
    return bestDir;
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
            if (blockAbove.name === 'water') {
                // does not call execute so does not interrupt other actions
                if (!bot.pathfinder.goal) {
                    bot.setControlState('jump', true);
                }
            }
            else if (this.fall_blocks.some(name => blockAbove.name.includes(name))) {
                execute(this, agent, async () => {
                    await skills.moveAway(bot, 2);
                });
            }
            else if (block.name === 'lava' || block.name === 'fire' ||
                blockAbove.name === 'lava' || blockAbove.name === 'fire') {
                say(agent, 'I\'m on fire!');
                // if you have a water bucket, use it
                let waterBucket = bot.inventory.items().find(item => item.name === 'water_bucket');
                if (waterBucket) {
                    execute(this, agent, async () => {
                        let success = await skills.placeBlock(bot, 'water_bucket', block.position.x, block.position.y, block.position.z);
                        if (success) say(agent, 'Placed some water, ahhhh that\'s better!');
                    });
                }
                else {
                    execute(this, agent, async () => {
                        let waterBucket = bot.inventory.items().find(item => item.name === 'water_bucket');
                        if (waterBucket) {
                            let success = await skills.placeBlock(bot, 'water_bucket', block.position.x, block.position.y, block.position.z);
                            if (success) say(agent, 'Placed some water, ahhhh that\'s better!');
                            return;
                        }
                        let nearestWater = world.getNearestBlock(bot, 'water', 20);
                        if (nearestWater) {
                            const pos = nearestWater.position;
                            let success = await skills.goToPosition(bot, pos.x, pos.y, pos.z, 0.2);
                            if (success) say(agent, 'Found some water, ahhhh that\'s better!');
                            return;
                        }
                        await skills.moveAway(bot, 5);
                    });
                }
            }
            else if (Date.now() - bot.lastDamageTime < 3000 && (bot.health < 5 || bot.lastDamageTaken >= bot.health)) {
                say(agent, 'I\'m dying!');
                execute(this, agent, async () => {
                    await skills.moveAway(bot, 20);
                });
            }
            else if (agent.isIdle()) {
                bot.clearControlStates(); // clear jump if not in danger or doing anything else
            }
        }
    },
    {
        name: 'fall_protection',
        description: 'Use water bucket when falling from height (MLG water). Critical survival skill.',
        interrupts: ['all'],
        on: true,
        active: false,
        lastY: null,
        fallStartY: null,
        update: async function (agent) {
            const bot = agent.bot;
            const pos = bot.entity.position;
            const vel = bot.entity.velocity;
            
            // Detect if falling (negative Y velocity)
            if (vel.y < -0.5) {
                if (this.fallStartY === null) {
                    this.fallStartY = pos.y;
                }
                
                const fallDistance = this.fallStartY - pos.y;
                
                // If falling more than 10 blocks and going fast, try MLG water
                if (fallDistance > 10 && vel.y < -0.8) {
                    const waterBucket = bot.inventory.items().find(item => item.name === 'water_bucket');
                    if (waterBucket && !this.active) {
                        // Check if ground is near (within 4 blocks)
                        const groundBlock = bot.blockAt(pos.offset(0, -4, 0));
                        if (groundBlock && groundBlock.name !== 'air' && groundBlock.name !== 'water') {
                            execute(this, agent, async () => {
                                say(agent, '¡Agua MLG!');
                                try {
                                    await bot.equip(waterBucket, 'hand');
                                    await bot.lookAt(pos.offset(0, -3, 0));
                                    bot.activateItem();
                                    await new Promise(r => setTimeout(r, 500));
                                    // Pick up water
                                    const waterBlock = world.getNearestBlock(bot, 'water', 3);
                                    if (waterBlock) {
                                        await bot.lookAt(waterBlock.position);
                                        bot.activateItem();
                                    }
                                } catch (e) { /* ignore */ }
                            });
                        }
                    }
                }
            } else {
                this.fallStartY = null;
            }
            
            this.lastY = pos.y;
        }
    },
    {
        name: 'auto_eat',
        description: 'Automatically eat food when hunger is low. Essential for survival.',
        interrupts: ['action:followPlayer', 'action:collectBlocks', 'action:goToPosition'],
        on: true,
        active: false,
        lastEatTime: 0,
        update: async function (agent) {
            const bot = agent.bot;
            
            // Don't eat too frequently (cooldown 30 seconds)
            if (Date.now() - this.lastEatTime < 30000) return;
            
            // Eat when hunger <= 15 (human-like behavior - we eat before starving)
            if (bot.food <= 15) {
                const food = getBestFood(bot);
                if (food) {
                    this.lastEatTime = Date.now();
                    execute(this, agent, async () => {
                        say(agent, `Tengo hambre, comiendo ${food.name.replace(/_/g, ' ')}...`);
                        try {
                            await bot.equip(food, 'hand');
                            bot.deactivateItem();
                            bot.activateItem();
                            // Wait for eating animation (about 1.6 seconds in Minecraft)
                            await new Promise(r => setTimeout(r, 2000));
                            bot.deactivateItem();
                            say(agent, '¡Delicioso!');
                        } catch (e) {
                            console.log('[AUTO_EAT] Error:', e.message);
                        }
                    });
                }
            }
        }
    },
    {
        name: 'auto_sleep',
        description: 'Automatically sleep in a bed when night falls to avoid monsters.',
        interrupts: ['action:followPlayer'],
        on: true,
        active: false,
        lastSleepCheck: 0,
        update: async function (agent) {
            const bot = agent.bot;
            
            // Only check every 10 seconds
            if (Date.now() - this.lastSleepCheck < 10000) return;
            this.lastSleepCheck = Date.now();
            
            // Check if it's night and we're not already sleeping
            if (isNightTime(bot) && !bot.isSleeping) {
                // Look for a bed within 32 blocks
                const beds = bot.findBlocks({
                    matching: (block) => block.name.includes('bed'),
                    maxDistance: 32,
                    count: 1
                });
                
                if (beds.length > 0) {
                    execute(this, agent, async () => {
                        say(agent, 'Es de noche, voy a dormir...');
                        try {
                            await skills.goToBed(bot);
                        } catch (e) {
                            // Bed might be occupied or obstructed
                            if (e.message && e.message.includes('occupied')) {
                                say(agent, 'La cama está ocupada.');
                            }
                        }
                    });
                }
            }
        }
    },
    {
        name: 'smart_armor',
        description: 'Automatically equip the best armor available before combat.',
        interrupts: [],
        on: true,
        active: false,
        lastCheck: 0,
        update: async function (agent) {
            const bot = agent.bot;
            
            // Only check every 5 seconds
            if (Date.now() - this.lastCheck < 5000) return;
            this.lastCheck = Date.now();
            
            // Check if there's danger nearby
            const enemy = world.getNearestEntityWhere(bot, entity => mc.isHostile(entity), 24);
            
            if (enemy || !agent.isIdle()) {
                // Use mineflayer-armor-manager to equip best armor
                try {
                    bot.armorManager.equipAll();
                } catch (e) { /* ignore */ }
            }
        }
    },
    {
        name: 'inventory_manager',
        description: 'Manage inventory by dropping junk items when full.',
        interrupts: [],
        on: true,
        active: false,
        lastCheck: 0,
        junkItems: ['rotten_flesh', 'poisonous_potato', 'spider_eye', 'pufferfish', 
                    'dead_bush', 'dune_armor_trim', 'tide_armor_trim', 'netherite_upgrade_smithing_template'],
        update: async function (agent) {
            const bot = agent.bot;
            
            // Only check every 30 seconds
            if (Date.now() - this.lastCheck < 30000) return;
            this.lastCheck = Date.now();
            
            // Check if inventory is nearly full (less than 3 empty slots)
            const emptySlots = bot.inventory.emptySlotCount();
            
            if (emptySlots <= 3) {
                // Find junk items to drop
                for (const junkName of this.junkItems) {
                    const junkItem = bot.inventory.items().find(item => item.name === junkName);
                    if (junkItem) {
                        execute(this, agent, async () => {
                            say(agent, `Tirando ${junkItem.name.replace(/_/g, ' ')} para hacer espacio...`);
                            try {
                                await bot.toss(junkItem.type, null, junkItem.count);
                            } catch (e) { /* ignore */ }
                        });
                        return; // Drop one type at a time
                    }
                }
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
        max_stuck_time: 60,
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
                this.stuck_time = 0;
                this.unstuck_attempts = (this.unstuck_attempts || 0) + 1;
                
                execute(this, agent, async () => {
                    const crashTimeout = setTimeout(() => { console.log('[UNSTUCK] Timeout'); }, 45000);
                    
                    try {
                        const pos = bot.entity.position;
                        
                        // Check if we're underground (can't see sky)
                        let canSeeSky = false;
                        for (let y = 1; y <= 50; y++) {
                            const blockUp = bot.blockAt(pos.offset(0, y, 0));
                            if (!blockUp || blockUp.name === 'air') {
                                canSeeSky = true;
                                break;
                            }
                            if (blockUp.name !== 'air' && blockUp.name !== 'cave_air') {
                                break;
                            }
                        }
                        
                        // Check if we have tools to dig
                        const hasPickaxe = bot.inventory.items().some(i => i.name.includes('pickaxe'));
                        
                        // Estrategia 1: Saltar primero
                        if (this.unstuck_attempts === 1) {
                            say(agent, 'Estoy atascado, saltando...');
                            bot.setControlState('jump', true);
                            bot.setControlState('forward', true);
                            await new Promise(r => setTimeout(r, 1000));
                            bot.clearControlStates();
                            await skills.moveAway(bot, 3);
                        }
                        // Estrategia 2: Romper bloques alrededor (prioritize upward if underground)
                        else if (this.unstuck_attempts <= 3) {
                            say(agent, 'Rompiendo bloques...');
                            // If underground, try to dig up first
                            const dirsUnderground = [[0,1,0],[0,2,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]];
                            const dirsSurface = [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[1,1,0],[-1,1,0],[0,1,1],[0,1,-1]];
                            const dirs = !canSeeSky ? dirsUnderground : dirsSurface;
                            
                            for (const [dx,dy,dz] of dirs) {
                                const block = bot.blockAt(pos.offset(dx, dy, dz));
                                if (block && block.name !== 'air' && block.name !== 'water' && block.name !== 'lava') {
                                    // Check if we CAN break this block
                                    const needsPickaxe = ['stone', 'cobblestone', 'andesite', 'diorite', 'granite', 'deepslate'].some(n => block.name.includes(n));
                                    if (needsPickaxe && !hasPickaxe) {
                                        // Can't break stone without pickaxe, try another direction
                                        continue;
                                    }
                                    if (block.hardness < 10 && block.hardness >= 0) {
                                        try { 
                                            await skills.breakBlockAt(bot, pos.x+dx, pos.y+dy, pos.z+dz); 
                                            break; 
                                        } catch(e) {}
                                    }
                                }
                            }
                            await skills.moveAway(bot, 4);
                        }
                        // Estrategia 3: If underground, try to dig staircase up
                        else if (this.unstuck_attempts <= 5) {
                            if (!canSeeSky && hasPickaxe) {
                                say(agent, 'Cavando escalera hacia arriba...');
                                // Dig a staircase pattern upward
                                for (let step = 0; step < 3; step++) {
                                    const upBlock = bot.blockAt(pos.offset(step, 1 + step, step));
                                    const upBlock2 = bot.blockAt(pos.offset(step, 2 + step, step));
                                    if (upBlock && upBlock.name !== 'air') {
                                        try { await skills.breakBlockAt(bot, pos.x+step, pos.y+1+step, pos.z+step); } catch(e) {}
                                    }
                                    if (upBlock2 && upBlock2.name !== 'air') {
                                        try { await skills.breakBlockAt(bot, pos.x+step, pos.y+2+step, pos.z+step); } catch(e) {}
                                    }
                                    // Move forward and up
                                    bot.setControlState('jump', true);
                                    bot.setControlState('forward', true);
                                    await new Promise(r => setTimeout(r, 500));
                                    bot.clearControlStates();
                                }
                            } else {
                                say(agent, 'Cavando...');
                                const below = bot.blockAt(pos.offset(0, -1, 0));
                                if (below && below.name !== 'air' && below.hardness < 10) {
                                    try { await skills.breakBlockAt(bot, pos.x, pos.y-1, pos.z); } catch(e) {}
                                }
                            }
                            await skills.moveAway(bot, 5);
                        }
                        // Estrategia 4: Pillar up if underground
                        else {
                            const inv = bot.inventory.items();
                            const block = inv.find(i => ['cobblestone','dirt','stone','netherrack','deepslate'].includes(i.name));
                            
                            if (!canSeeSky && block) {
                                say(agent, 'Construyendo hacia arriba...');
                                // Pillar up several blocks
                                for (let i = 0; i < 5; i++) {
                                    try {
                                        bot.setControlState('jump', true);
                                        await new Promise(r => setTimeout(r, 250));
                                        await skills.placeBlock(bot, block.name, Math.floor(pos.x), Math.floor(pos.y) - 1 + i, Math.floor(pos.z), 'bottom', false);
                                    } catch(e) { break; }
                                }
                                bot.clearControlStates();
                            } else {
                                say(agent, 'Buscando salida...');
                                if (block) {
                                    try {
                                        bot.setControlState('jump', true);
                                        await new Promise(r => setTimeout(r, 200));
                                        await skills.placeBlock(bot, block.name, pos.x, pos.y-1, pos.z, 'bottom', false);
                                        bot.clearControlStates();
                                    } catch(e) {}
                                }
                            }
                            await skills.moveAway(bot, 6);
                            this.unstuck_attempts = 0;
                        }
                        say(agent, 'Me libere.');
                    } catch(e) { console.log('[UNSTUCK] Error:', e.message); }
                    clearTimeout(crashTimeout);
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
        description: 'Run away from dangerous enemies to safe positions. More intelligent escape.',
        interrupts: ['all'],
        on: true,
        active: false,
        lastFleeTime: 0,
        update: async function (agent) {
            const bot = agent.bot;
            
            // Don't spam flee (cooldown 3 seconds)
            if (Date.now() - this.lastFleeTime < 3000) return;
            
            // Detect enemies at realistic human visual range (24 blocks)
            const enemies = [];
            const nearbyEntities = world.getNearbyEntities(bot, 24);
            for (const entity of nearbyEntities) {
                if (mc.isHostile(entity)) {
                    enemies.push(entity);
                }
            }
            
            if (enemies.length === 0) return;
            
            const nearestEnemy = enemies[0];
            const distance = bot.entity.position.distanceTo(nearestEnemy.position);
            
            // Flee conditions: 
            // 1. Low health (< 8 hearts)
            // 2. Multiple enemies (3+)
            // 3. Creeper within 6 blocks (explosion danger)
            // 4. No weapon equipped
            const isCreeperClose = enemies.some(e => e.name === 'creeper' && bot.entity.position.distanceTo(e.position) < 6);
            const hasWeapon = bot.inventory.items().some(i => i.name.includes('sword') || i.name.includes('axe'));
            const shouldFlee = bot.health < 8 || enemies.length >= 3 || isCreeperClose || (!hasWeapon && distance < 12);
            
            if (shouldFlee && await world.isClearPath(bot, nearestEnemy)) {
                this.lastFleeTime = Date.now();
                
                const enemyName = nearestEnemy.name.replace(/_/g, ' ');
                const fleeReason = isCreeperClose ? '¡Creeper!' : 
                                   enemies.length >= 3 ? '¡Muchos enemigos!' :
                                   bot.health < 8 ? '¡Estoy herido!' : 
                                   '¡Peligro!';
                
                say(agent, `${fleeReason} Huyendo de ${enemyName}!`);
                
                execute(this, agent, async () => {
                    // Find safe escape position
                    const safePos = getSafeEscapePosition(bot, enemies, 28);
                    if (safePos) {
                        try {
                            await skills.goToPosition(bot, safePos.x, safePos.y, safePos.z, 2);
                        } catch (e) {
                            // Fallback to simple moveAway
                            await skills.avoidEnemies(bot, 28);
                        }
                    } else {
                        await skills.avoidEnemies(bot, 28);
                    }
                });
            }
        }
    },
    {
        name: 'self_defense',
        description: 'Attack nearby enemies when conditions are favorable. Smart combat.',
        interrupts: ['all'],
        on: true,
        active: false,
        lastCombatTime: 0,
        update: async function (agent) {
            const bot = agent.bot;
            
            // Combat cooldown 2 seconds
            if (Date.now() - this.lastCombatTime < 2000) return;
            
            // Find enemies at combat range (12 blocks - realistic engagement distance)
            const enemy = world.getNearestEntityWhere(bot, entity => mc.isHostile(entity), 12);
            
            if (!enemy) return;
            
            const distance = bot.entity.position.distanceTo(enemy.position);
            
            // Conditions to fight:
            // 1. Good health (> 6 hearts)
            // 2. Enemy is close (< 10 blocks)
            // 3. Not a creeper too close (let cowardice handle that)
            // 4. Have some weapon or fists
            const isCreeperClose = enemy.name === 'creeper' && distance < 5;
            const canFight = bot.health > 6 && distance < 10 && !isCreeperClose;
            
            if (canFight && await world.isClearPath(bot, enemy)) {
                this.lastCombatTime = Date.now();
                
                // Equip best armor before combat
                try { bot.armorManager.equipAll(); } catch (e) {}
                
                const enemyName = enemy.name.replace(/_/g, ' ');
                say(agent, `¡Atacando ${enemyName}!`);
                
                execute(this, agent, async () => {
                    await skills.defendSelf(bot, 12);
                });
            }
        }
    },
    {
        name: 'hunting',
        description: 'Hunt nearby animals when idle. Human-like vision range with smart pathfinding detection.',
        interrupts: ['action:followPlayer'],
        on: true,
        active: false,
        lastHuntTime: 0,
        failedAttempts: 0,        // Track consecutive failures
        lastFailedTarget: null,   // Don't retry same target immediately
        cooldownUntil: 0,         // Extended cooldown after multiple failures
        lastPosition: null,       // Detect if we're stuck
        stuckCount: 0,            // Count stuck occurrences
        preferredPrey: ['cow', 'pig', 'sheep', 'chicken', 'rabbit'],
        update: async function (agent) {
            const bot = agent.bot;
            const now = Date.now();
            
            // Extended cooldown after multiple failures (exponential backoff)
            if (now < this.cooldownUntil) return;
            
            // Normal hunt cooldown 5 seconds
            if (now - this.lastHuntTime < 5000) return;
            
            // Check if we're stuck (same position repeatedly)
            const currentPos = bot.entity.position.clone();
            if (this.lastPosition && currentPos.distanceTo(this.lastPosition) < 2) {
                this.stuckCount++;
                if (this.stuckCount >= 3) {
                    // We're stuck - don't hunt, let unstuck mode handle it
                    console.log('[HUNTING] Bot appears stuck, skipping hunt');
                    this.cooldownUntil = now + 30000; // Wait 30 seconds
                    this.stuckCount = 0;
                    this.failedAttempts = 0;
                    return;
                }
            } else {
                this.stuckCount = 0;
            }
            this.lastPosition = currentPos;
            
            // Don't hunt if monsters nearby
            const enemy = world.getNearestEntityWhere(bot, entity => mc.isHostile(entity), 16);
            if (enemy) return;
            
            // Check if bot has tools to break blocks (needed if path is blocked)
            const hasPickaxe = bot.inventory.items().some(i => i.name.includes('pickaxe'));
            const hasAxe = bot.inventory.items().some(i => i.name.includes('_axe'));
            const hasShovel = bot.inventory.items().some(i => i.name.includes('shovel'));
            const hasTools = hasPickaxe || hasAxe || hasShovel;
            
            // Check if bot can see sky (is on surface)
            const blockAbove = bot.blockAt(currentPos.offset(0, 2, 0));
            const canSeeSky = !blockAbove || blockAbove.name === 'air';
            
            // If we've failed too many times and don't have tools, enter extended cooldown
            if (this.failedAttempts >= 3 && !hasTools) {
                console.log('[HUNTING] Too many failures without tools, entering extended cooldown');
                say(agent, 'No puedo cazar sin herramientas, buscaré otra cosa que hacer.');
                this.cooldownUntil = now + 60000; // 1 minute cooldown
                this.failedAttempts = 0;
                return;
            }
            
            // If underground (can't see sky) and failing, prioritize getting out
            if (!canSeeSky && this.failedAttempts >= 2) {
                console.log('[HUNTING] Underground with failures, should surface first');
                this.cooldownUntil = now + 45000; // 45 second cooldown to let other modes work
                this.failedAttempts = 0;
                return;
            }
            
            // Adjust search range based on situation
            // If underground or failing, search closer
            let searchRange = 60; // Default human vision range
            if (!canSeeSky) searchRange = 24; // Limited vision underground
            if (this.failedAttempts >= 1) searchRange = Math.max(16, searchRange - (this.failedAttempts * 15));
            
            // Find prey
            let huntable = null;
            for (const preyName of this.preferredPrey) {
                huntable = world.getNearestEntityWhere(bot, entity => 
                    entity.name === preyName && mc.isHuntable(entity), searchRange);
                if (huntable) break;
            }
            
            if (!huntable) {
                huntable = world.getNearestEntityWhere(bot, entity => mc.isHuntable(entity), Math.min(searchRange, 32));
            }
            
            if (!huntable) {
                // No prey found - reset failures
                this.failedAttempts = 0;
                return;
            }
            
            // Skip if this is the same target that just failed
            if (this.lastFailedTarget && huntable.id === this.lastFailedTarget) {
                return;
            }
            
            const distance = currentPos.distanceTo(huntable.position);
            
            // Check if path is clear (important for avoiding stuck situations)
            const hasPath = await world.isClearPath(bot, huntable);
            
            // If path is not clear and we're far away, don't attempt
            if (!hasPath && distance > 16) {
                console.log('[HUNTING] No clear path to distant prey, skipping');
                this.failedAttempts++;
                this.lastFailedTarget = huntable.id;
                if (this.failedAttempts >= 3) {
                    this.cooldownUntil = now + 30000;
                }
                return;
            }
            
            // If path is not clear and we have no tools, skip
            if (!hasPath && !hasTools && distance > 8) {
                console.log('[HUNTING] No clear path and no tools, skipping');
                return;
            }
            
            this.lastHuntTime = now;
            const preyName = huntable.name.replace(/_/g, ' ');
            const huntableRef = huntable; // Capture reference
            
            execute(this, agent, async () => {
                try {
                    const startPos = bot.entity.position.clone();
                    
                    if (distance > 16) {
                        say(agent, `Veo un ${preyName} a lo lejos, voy a cazarlo...`);
                        await skills.goToPosition(bot, huntableRef.position.x, huntableRef.position.y, huntableRef.position.z, 4);
                        
                        // Check if we actually moved
                        const endPos = bot.entity.position;
                        if (startPos.distanceTo(endPos) < 3) {
                            // Didn't move much - we're stuck
                            console.log('[HUNTING] Failed to reach prey - stuck');
                            this.failedAttempts++;
                            this.lastFailedTarget = huntableRef.id;
                            if (this.failedAttempts >= 2) {
                                say(agent, 'No puedo llegar, buscaré otra cosa...');
                                this.cooldownUntil = Date.now() + 20000 * this.failedAttempts;
                            }
                            return;
                        }
                    } else {
                        say(agent, `¡Cazando ${preyName}!`);
                    }
                    
                    await skills.attackEntity(bot, huntableRef);
                    
                    // Success! Reset failures
                    this.failedAttempts = 0;
                    this.lastFailedTarget = null;
                    
                } catch (e) {
                    console.log('[HUNTING] Hunt failed:', e.message);
                    this.failedAttempts++;
                    this.lastFailedTarget = huntableRef.id;
                    
                    // Check for specific pathfinding errors
                    if (e.message && (e.message.includes('Cannot break') || e.message.includes('Path was stopped'))) {
                        say(agent, 'No puedo alcanzar la presa...');
                        this.cooldownUntil = Date.now() + 15000 * this.failedAttempts;
                    }
                }
            });
        }
    },
    {
        name: 'item_collecting',
        description: 'Collect nearby dropped items. Human-like behavior with prioritization.',
        interrupts: ['action:followPlayer'],
        on: true,
        active: false,
        wait: 1.5, // Faster reaction like a human
        prev_item: null,
        noticed_at: -1,
        valuableItems: ['diamond', 'emerald', 'gold', 'iron', 'netherite', 'totem', 'enchanted'],
        update: async function (agent) {
            const bot = agent.bot;
            
            // Search for items in a wider range (16 blocks - human awareness)
            let item = world.getNearestEntityWhere(bot, entity => entity.name === 'item', 16);
            let empty_inv_slots = bot.inventory.emptySlotCount();
            
            if (item && item !== this.prev_item && empty_inv_slots > 1) {
                // Check if item is valuable (react faster to valuable items)
                const isValuable = this.valuableItems.some(v => 
                    item.metadata && item.metadata[8] && item.metadata[8].itemId && 
                    item.metadata[8].itemId.toString().includes(v));
                
                const waitTime = isValuable ? 0.5 : this.wait;
                
                if (this.noticed_at === -1) {
                    this.noticed_at = Date.now();
                }
                
                if (Date.now() - this.noticed_at > waitTime * 1000) {
                    // Check path only when we're about to pick up
                    if (await world.isClearPath(bot, item)) {
                        say(agent, isValuable ? '¡Objeto valioso!' : 'Recogiendo objeto...');
                        this.prev_item = item;
                        execute(this, agent, async () => {
                            await skills.pickupNearbyItems(bot);
                        });
                        this.noticed_at = -1;
                    }
                }
            } else {
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
        update: function (agent) {
            if (world.shouldPlaceTorch(agent.bot)) {
                if (Date.now() - this.last_place < this.cooldown * 1000) return;
                execute(this, agent, async () => {
                    const pos = agent.bot.entity.position;
                    await skills.placeBlock(agent.bot, 'torch', pos.x, pos.y, pos.z, 'bottom', true);
                });
                this.last_place = Date.now();
            }
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
                execute(this, agent, async () => {
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
        name: 'cheat',
        description: 'Use cheats to instantly place blocks and teleport.',
        interrupts: [],
        on: false,
        active: false,
        update: function (agent) { /* do nothing */ }
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
                await mode.update(_agent);
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



