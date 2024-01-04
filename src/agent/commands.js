import * as skills from './skills.js';
import * as world from './world.js';


function wrapExecution(func) {
    return async function (agent) {
        agent.bot.output = '';
        agent.coder.executing = true;
        let res = await func(agent);
        if (res)
            agent.bot.output += '\n' + res;
        agent.coder.executing = false;
        return '\n' + agent.bot.output + '\n';
    }
}

const commandList = [
    {
        name: '!execute_action',
        description: 'Write and execute code to perform custom behaviors not available as a command.', 
        perform: async function (agent) {
            let res = await agent.coder.generateCode(agent.history);
            if (res)
                return '\n' + res + '\n';
        }
    },
    {
        name: '!abort',
        description: 'Force stop all actions and commands that are currently executing.',
        perform: async function (agent) {
            await agent.coder.stop();
        }
    },
    // {
    //     name: '!gotoplayer',
    //     description: 'Go to the nearest player.',
    //     perform: wrapExecution(async (agent) => {
    //         let player_name = world.getNearbyPlayerNames(agent.bot);
    //         if (player_name.length == 0)
    //             return 'No players nearby.';
    //         await skills.goToPlayer(agent.bot, player_name[0]);
    //     })
    // },
    // {
    //     name: '!followplayer',
    //     description: 'Follow the nearest player.',
    //     perform: wrapExecution(async (agent) => {
    //         let player_name = world.getNearbyPlayerNames(agent.bot);
    //         if (player_name.length == 0)
    //             return 'No players nearby.';
    //         await skills.followPlayer(agent.bot, player_name[0]);
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

const commandMap = {};
for (let command of commandList) {
    commandMap[command.name] = command;
}

export function getCommand(name) {
    return commandMap[name];
}

export function containsCommand(message) {
    for (let command of commandList) {
        if (message.includes(command.name)) {
            return command.name;
        }
    }
    return null;
}

export function getCommandDocs() {
    let docs = `\n*COMMAND DOCS\n You can use the following commands to execute actions in the world. Use the command name in your response and the results of the command will be included in the next input. Do not use commands not listed below. If trying to perform an action outside of the scope the listed commands, use the !custom command to write custom code.\n`;
    for (let command of commandList) {
        docs += command.name + ': ' + command.description + '\n';
    }
    return docs + '*\n';
}