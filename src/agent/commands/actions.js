import * as skills from '../skills.js';
import * as world from '../world.js';

function wrapExecution(func) {
    return async function (agent, ...args) {
        let code_return = await agent.coder.execute(async () => {
            await func(agent, ...args);
        }, -1); // no timeout
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
            let res = await agent.coder.generateCode(agent.history);
            if (res)
                return '\n' + res + '\n';
        }
    },
    {
        name: '!stop',
        description: 'Force stop all actions and commands that are currently executing.',
        perform: async function (agent) {
            await agent.coder.stop();
            return 'Agent stopped.';
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
        description: 'Endlessly follow the given player. Ex: !followPlayer("stevie")',
        params: {'player_name': '(string) The name of the player to follow.'},
        perform: wrapExecution(async (agent, player_name) => {
            await skills.followPlayer(agent.bot, player_name);
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
        })
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
            await skills.attackMob(agent.bot, type, true);
        })
    },
    {
        name: '!defend',
        description: 'Follow the given player and attack any nearby monsters.',
        params: {'player_name': '(string) The name of the player to defend.'},
        perform: wrapExecution(async (agent, player_name) => {
            await skills.defendPlayer(agent.bot, player_name);
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
