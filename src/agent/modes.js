import * as skills from './library/skills.js';
import * as world from './library/world.js';
import * as mc from '../utils/mcdata.js';


// a mode is a function that is called every tick to respond immediately to the world
// it has the following fields:
// on: whether 'update' is called every tick
// active: whether an action has been triggered by the mode and hasn't yet finished
// paused: whether the mode is paused by another action that overrides the behavior (eg followplayer implements its own self defense)
// update: the function that is called every tick (if on is true)
// when a mode is active, it will trigger an action to be performed but won't wait for it to return output
// the order of this list matters! first modes will be prioritized
const modes = [
    {
        name: 'self_defense',
        description: 'Automatically attack nearby enemies. Interrupts other actions.',
        interrupts: ['all'],
        on: true,
        active: false,
        update: function (agent) {
            const enemy = world.getNearestEntityWhere(agent.bot, entity => mc.isHostile(entity), 8);
            if (enemy) {
                agent.bot.chat(`Fighting ${enemy.name}!`);
                execute(this, agent, async () => {
                    await skills.defendSelf(agent.bot, 8);
                });
            }
        }
    },
    {
        name: 'hunting',
        description: 'Automatically hunt nearby animals when idle.',
        interrupts: ['defaults'],
        on: true,
        active: false,
        update: function (agent) {
            const huntable = world.getNearestEntityWhere(agent.bot, entity => mc.isHuntable(entity), 8);
            if (huntable) {
                execute(this, agent, async () => {
                    agent.bot.chat(`Hunting ${huntable.name}!`);
                    await skills.attackEntity(agent.bot, huntable);
                });
            }
        }
    },
    {
        name: 'item_collecting',
        description: 'Automatically collect nearby items when idle.',
        interrupts: ['followPlayer'],
        on: true,
        active: false,
        update: function (agent) {
            let item = world.getNearestEntityWhere(agent.bot, entity => entity.name === 'item', 8);
            if (item) {
                execute(this, agent, async () => {
                    // wait 2 seconds for the item to settle
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    await skills.pickupNearbyItem(agent.bot);
                });
            }
        }
    },
    {
        name: 'torch_placing',
        description: 'Automatically place torches when idle and there are no torches nearby.',
        interrupts: ['followPlayer'],
        on: true,
        active: false,
        update: function (agent) {
            // TODO: check light level instead of nearby torches, block.light is broken
            const near_torch = world.getNearestBlock(agent.bot, 'torch', 8);
            if (!near_torch) {
                let torches = agent.bot.inventory.items().filter(item => item.name.includes('torch'));
                if (torches.length > 0) {
                    const torch = torches[0];
                    const pos = agent.bot.entity.position;
                    execute(this, agent, async () => {
                        await skills.placeBlock(agent.bot, torch.name, pos.x, pos.y, pos.z);
                    });
                }
            }
        }
    },
    {
        name: 'idle_staring',
        description: 'Non-functional animation to look around at entities when idle.',
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
];

async function execute(mode, agent, func, timeout=-1) {
    mode.active = true;
    let code_return = await agent.coder.execute(async () => {
        await func();
    }, timeout);
    mode.active = false;
    console.log(`Mode ${mode.name} finished executing, code_return: ${code_return.message}`);
}

class ModeController {
    constructor(agent) {
        this.agent = agent;
        this.modes_list = modes;
        this.modes_map = {};
        for (let mode of this.modes_list) {
            this.modes_map[mode.name] = mode;
        }
    }

    exists(mode_name) {
        return this.modes_map[mode_name] != null;
    }

    setOn(mode_name, on) {
        this.modes_map[mode_name].on = on;
    }

    isOn(mode_name) {
        return this.modes_map[mode_name].on;
    }

    pause(mode_name) {
        this.modes_map[mode_name].paused = true;
    }

    getStr() {
        let res = 'Available Modes:';
        for (let mode of this.modes_list) {
            let on = mode.on ? 'ON' : 'OFF';
            res += `\n- ${mode.name}(${on}): ${mode.description}`;
        }
        return res;
    }

    update() {
        if (!this.agent.coder.executing) {
            // other actions might pause a mode to override it
            // when idle, unpause all modes
            for (let mode of this.modes_list) {
                if (mode.paused) console.log(`Unpausing mode ${mode.name}`);
                mode.paused = false;
            }
        }
        for (let mode of this.modes_list) {
            let available = mode.interrupts.includes('all') || !this.agent.coder.executing;
            let interruptible = this.agent.coder.interruptible && (mode.interrupts.includes('defaults') || mode.interrupts.includes(this.agent.coder.default_name));
            if (mode.on && !mode.paused && !mode.active && (available || interruptible)) {
                mode.update(this.agent);
            }
            if (mode.active) break;
        }
    }
}

export function initModes(agent) {
    // the mode controller is added to the bot object so it is accessible from anywhere the bot is used
    agent.bot.modes = new ModeController(agent);
}
