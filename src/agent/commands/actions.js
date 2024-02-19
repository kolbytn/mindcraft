import * as skills from '../library/skills.js';
import settings from '../../settings.js';

function wrapExecution(func, timeout=-1, resume_name=null) {
    return async function (agent, ...args) {
        let code_return;
        if (resume_name != null) {
            code_return = await agent.coder.executeResume(async () => {
                await func(agent, ...args);
            }, resume_name, timeout);
        } else {
            code_return = await agent.coder.execute(async () => {
                await func(agent, ...args);
            }, timeout);
        }
        if (code_return.interrupted && !code_return.timedout)
            return;
        return code_return.message;
    }
}

export const actionsList = [
    {
        name: '!newAction',
        description: 'Perform custom behaviors not available as a command by writing code.', 
        perform: async function (agent) {
            if (!settings.allow_insecure_coding)
                return 'Agent is not allowed to write code.';
            return await agent.coder.generateCode(agent.history);
        }
    },
    {
        name: '!stop',
        description: 'Force stop all actions.',
        perform: async function (agent) {
            await agent.coder.stop();
            agent.coder.clear();
            agent.coder.cancelResume();
            return 'Agent stopped.';
        }
    },
    {
        name: '!restart',
        description: 'Restart the agent.',
        perform: async function (agent) {
            process.exit(1);
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
        name: '!setMode',
        description: 'Set a mode to on or off. A mode is an automatic behavior that responds to the environment. Ex: !setMode("hunting", true)',
        params: {
            'mode_name': '(string) Name of the mode.',
            'on': '(bool) Whether to enable or disable the mode.'
        },
        perform: async function (agent, mode_name, on) {
            const modes = agent.bot.modes;
            if (!modes.exists(mode_name))
                return `Mode ${mode_name} does not exist.` + modes.getStr();
            if (modes.isOn(mode_name) === on)
                return `Mode ${mode_name} is already ${on ? 'on' : 'off'}.`;
            modes.setOn(mode_name, on);
            return `Mode ${mode_name} is now ${on ? 'on' : 'off'}.`;
        }
    },
    {
        name: '!goToPlayer',
        description: 'Go to the given player. Ex: !goToPlayer("steve", 3)',
        params: {
            'player_name': '(string) Name of the player.',
            'closeness': '(number) How close to get to the player.'
        },
        perform: wrapExecution(async (agent, player_name, closeness) => {
            return await skills.goToPlayer(agent.bot, player_name, closeness);
        })
    },
    {
        name: '!followPlayer',
        description: 'Follow the given player. Ex: !followPlayer("stevie", 4)',
        params: {
            'player_name': '(string) Name of the player to follow.',
            'follow_dist': '(number) Distance to follow from.'
        },
        perform: wrapExecution(async (agent, player_name, follow_dist) => {
            await skills.followPlayer(agent.bot, player_name, follow_dist);
        }, -1, 'followPlayer')
    },
    {
        name: '!moveAway',
        description: 'Move away by a given distance.',
        params: {'distance': '(number) Distance to move away.'},
        perform: wrapExecution(async (agent, distance) => {
            await skills.moveAway(agent.bot, distance);
        })
    },
    {
        name: '!givePlayer',
        description: 'Give the specified item to the given player. Ex: !givePlayer("steve", "stone_pickaxe", 1)',
        params: { 
            'player_name': '(string) Name of the player to give the item to.', 
            'item_name': '(string) Name of the item to give.' ,
            'num': '(number) Number of items to give.'
        },
        perform: wrapExecution(async (agent, player_name, item_name, num) => {
            await skills.giveToPlayer(agent.bot, item_name, player_name, num);
        })
    },
    {
        name: '!collectBlocks',
        description: 'Collect the nearest blocks of a given type. Ex: !collectBlocks("stone", 10)',
        params: {
            'type': '(string) The block type to collect.',
            'num': '(number) Number of blocks to collect.'
        },
        perform: wrapExecution(async (agent, type, num) => {
            await skills.collectBlock(agent.bot, type, num);
        }, 10) // 10 minute timeout
    },
    {
        name: '!collectAllBlocks',
        description: 'Collect all the nearest blocks of a given type until told to stop.',
        params: {
            'type': '(string) The block type to collect.'
        },
        perform: wrapExecution(async (agent, type) => {
            let success = await skills.collectBlock(agent.bot, type, 1);
            if (!success)
                agent.coder.cancelResume();
        }, 10, 'collectAllBlocks') // 10 minute timeout
    },
    {
        name: '!craftRecipe',
        description: 'Craft the given recipe a given number of times. Ex: I will craft 8 sticks !craftRecipe("stick", 2)',
        params: {
            'recipe_name': '(string) Name of the output item to craft.',
            'num': '(number) Number of times to craft the recipe, NOT the number of output items.'
        },
        perform: wrapExecution(async (agent, recipe_name, num) => {
            for (let i=0; i<num; i++) {
                await skills.craftRecipe(agent.bot, recipe_name);
            }
        })
    },
    {
        name: '!placeHere',
        description: 'Place a block in the current location. Only use for single blocks/torches, NOT structures.',
        params: {'type': '(string) The block type to place.'},
        perform: wrapExecution(async (agent, type) => {
            let pos = agent.bot.entity.position;
            await skills.placeBlock(agent.bot, type, pos.x, pos.y, pos.z);
        })
    },
    {
        name: '!attack',
        description: 'Kill an entity of a given type.',
        params: {'type': '(string) The type of entity to attack.'},
        perform: wrapExecution(async (agent, type) => {
            await skills.attackNearest(agent.bot, type, true);
        })
    },
    {
        name: '!goToBed',
        description: 'Go to bed and sleep.',
        perform: wrapExecution(async (agent) => {
            await skills.goToBed(agent.bot);
        })
    },
    {
        name: '!stay',
        description: 'Stay in the current location no matter what. Pauses all modes.',
        perform: wrapExecution(async (agent) => {
            await skills.stay(agent.bot);
        })
    }
];
