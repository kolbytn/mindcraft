import * as skills from '../library/skills.js';


function wrapExecution(func, timeout=-1, default_name=null) {
    return async function (agent, ...args) {
        let code_return;
        if (default_name != null) {
            code_return = await agent.coder.executeDefault(async () => {
                await func(agent, ...args);
            }, default_name, timeout);
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
        description: 'Perform new and unknown custom behaviors that are not available as a command by writing code.', 
        perform: async function (agent) {
            await agent.coder.generateCode(agent.history);
        }
    },
    {
        name: '!stop',
        description: 'Force stop all actions and commands that are currently executing.',
        perform: async function (agent) {
            await agent.coder.stop();
            agent.coder.clear();
            agent.coder.default_func = null;
            agent.coder.default_name = null;
            return 'Agent stopped.';
        }
    },
    {
        name: '!setMode',
        description: 'Set a mode to on or off. A mode is an automatic behavior that constantly checks and responds to the environment. Ex: !setMode("hunting", true)',
        params: {
            'mode_name': '(string) The name of the mode to enable.',
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
        description: 'Go to the given player. Ex: !goToPlayer("steve")',
        params: {'player_name': '(string) The name of the player to go to.'},
        perform: wrapExecution(async (agent, player_name) => {
            return await skills.goToPlayer(agent.bot, player_name);
        })
    },
    {
        name: '!followPlayer',
        description: 'Endlessly follow the given player. Will defend that player if self_defense mode is on. Ex: !followPlayer("stevie")',
        params: {'player_name': '(string) The name of the player to follow.'},
        perform: wrapExecution(async (agent, player_name) => {
            await skills.followPlayer(agent.bot, player_name);
        }, -1, 'followPlayer')
    },
    {
        name: '!givePlayer',
        description: 'Give the specified item to the given player. Ex: !givePlayer("steve", "stone_pickaxe", 1)',
        params: { 
            'player_name': '(string) The name of the player to give the item to.', 
            'item_name': '(string) The name of the item to give.' ,
            'num': '(number) The number of items to give.'
        },
        perform: wrapExecution(async (agent, player_name, item_name, num) => {
            await skills.giveToPlayer(agent.bot, item_name, player_name, num);
        })
    },
    {
        name: '!collectBlocks',
        description: 'Collect the nearest blocks of a given type.',
        params: {
            'type': '(string) The block type to collect. Ex: !collectBlocks("stone", 10)',
            'num': '(number) The number of blocks to collect.'
        },
        perform: wrapExecution(async (agent, type, num) => {
            await skills.collectBlock(agent.bot, type, num);
        }, 10) // 10 minute timeout
    },
    {
        name: '!collectAllBlocks',
        description: 'Collect all the nearest blocks of a given type until told to stop.',
        params: {
            'type': '(string) The block type to collect. Ex: !collectAllBlocks("stone")'
        },
        perform: wrapExecution(async (agent, type) => {
            await skills.collectBlock(agent.bot, type, 1);
        }, 10, 'collectAllBlocks') // 10 minute timeout
    },
    {
        name: '!craftRecipe',
        description: 'Craft the given recipe a given number of times. Ex: I will craft 8 sticks !craftRecipe("stick", 2)',
        params: {
            'recipe_name': '(string) The name of the output item to craft.',
            'num': '(number) The number of times to craft the recipe. This is NOT the number of output items, as it may craft many more items depending on the recipe.'
        },
        perform: wrapExecution(async (agent, recipe_name, num) => {
            for (let i=0; i<num; i++) {
                await skills.craftRecipe(agent.bot, recipe_name);
            }
        })
    },
    {
        name: '!placeHere',
        description: 'Place a given block in the current location. Do NOT use to build structures, only use for single blocks/torches. Ex: !placeBlockHere("crafting_table")',
        params: {'type': '(string) The block type to place.'},
        perform: wrapExecution(async (agent, type) => {
            let pos = agent.bot.entity.position;
            await skills.placeBlock(agent.bot, type, pos.x, pos.y, pos.z);
        })
    },
    {
        name: '!attack',
        description: 'Attack and kill the nearest entity of a given type.',
        params: {'type': '(string) The type of entity to attack.'},
        perform: wrapExecution(async (agent, type) => {
            await skills.attackNearest(agent.bot, type, true);
        })
    },
    {
        name: '!goToBed',
        description: 'Go to the nearest bed and sleep.',
        perform: wrapExecution(async (agent) => {
            await skills.goToBed(agent.bot);
        })
    }
];
