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
    // {
    //     name: '!followPlayer',
    //     description: 'Follow the nearest player.',
    //     perform: wrapExecution(async (agent, player_name) => {
    //         await skills.followPlayer(agent.bot, player_name);
    //     })
    // },
    // {
    //     name: '!collectwood',
    //     description: 'Collect 3 wood logs of any type.',
    //     perform: wrapExecution(async (agent) => {
    //         let blocks = world.getNearbyBlockTypes(agent.bot);
    //         for (let block of blocks) {
    //             if (block.includes('log')) {
    //                 await skills.collectBlock(agent.bot, block, 3);
    //                 return;
    //             }
    //         }
    //         return 'No wood nearby.';
    //     })
    // },
    // {
    //     name: '!collectstone',
    //     description: 'Collect 3 cobblestone blocks.',
    //     perform: wrapExecution(async (agent) => {
    //         let inventory = world.getInventoryCounts(agent.bot);
    //         for (const item in inventory) {
    //             if (inventory[item] && inventory[item] > 0 && item.includes('pickaxe')) {
    //                 if (await skills.equip(agent.bot, 'pickaxe'))
    //                     await skills.collectBlock(agent.bot, 'stone', 3);
    //                 return;
    //             }
    //         }
    //         return 'No pickaxe in inventory.';
    //     })
    // },
    // {
    //     name: '!fightmob',
    //     description: 'Fight the nearest mob.',
    //     perform: wrapExecution(async (agent) => {
    //         let mobs = world.getNearbyMobTypes(agent.bot);
    //         if (mobs.length == 0)
    //             return 'No mobs nearby.';
    //         await skills.attackMob(agent.bot, mobs[0], true);
    //     })
    // }
];
