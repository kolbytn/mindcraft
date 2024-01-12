import * as skills from '../skills.js';
import * as world from '../world.js';

function wrapExecution(func) {
    return async function (agent, ...args) {
        agent.bot.output = '';
        agent.coder.executing = true;
        let res = await func(agent, ...args);
        if (res)
            agent.bot.output += '\n' + res;
        agent.coder.executing = false;
        return '\n' + agent.bot.output + '\n';
    }
}

// const actionsList = [
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
        description: 'Go to the nearest player. Ex: !goToPlayer("steve")',
        params: {'player_name': '(string) The name of the player to go to.'},
        perform: wrapExecution(async (agent, player_name) => {
            return await skills.goToPlayer(agent.bot, player_name);
        })
    },
    {
        name: '!followPlayer',
        description: 'Endlessly follow the nearest player. Ex: !followPlayer("stevie")',
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
        name: '!attack',
        description: 'Attack and kill the nearest entity of a given type.',
        params: {'type': '(string) The type of entity to attack.'},
        perform: wrapExecution(async (agent, type) => {
            await skills.attackMob(agent.bot, type, true);
        })
    }
];
