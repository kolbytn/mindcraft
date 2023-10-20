import { getStats, getInventory, getBlocks, getNearbyEntities, getCraftable } from './context.js';
import { currentCode, executeCode, writeCode } from '../act.js';

const pad = (str) => {
    return '\n\`\`\`\n' + str + '\n\`\`\`';
}

const commandsList = [
    {
        name: "!stats",
        description: "Get the bot's stats (name, health, food, saturation, armor, held item, position, velocity, gamemode, experience, level, effects).", 
        perform: function (bot) {
            return pad(getStats(bot));
        }
    },
    {
        name: "!inventory",
        description: "Get the bot's inventory.",
        perform: function (bot) {
            return pad(getInventory(bot));
        }
    },
    {
        name: "!blocks",
        description: "Get the blocks near the bot.",
        perform: function (bot) {
            return pad(getBlocks(bot));
        }
    },
    {
        name: "!craftable",
        description: "Get the craftable items with the bot's inventory.",
        perform: function (bot) {
            return pad(getCraftable(bot));
        }
    },
    {
        name: "!entities",
        description: "Get the nearby players and entities.",
        perform: function (bot) {
            return pad(getNearbyEntities(bot));
        }
    },
    {
        name: "!action",
        description: "Get the currently executing code.",
        perform: function (bot) {
            return pad(currentCode(bot));
        }
    },
    {
        name: "!execute",
        description: "Execute actions in the game by writing and calling javascript code with the following command: \n!execute\n\`\`\`\nCODE\n\`\`\`",
        perform: function (bot) {
            return writeCode(bot, user, turns.concat(botResponse), botResponse);
        }
    }
];

const commandsMap = {};
for (let command of commandsList) {
    commandsMap[command.name] = command;
}

export function getCommand(name) {
    return commandsMap[name];
}

export function commandExists(name) {
    return commandsMap[name] != undefined;
}

export function getCommandDocs() {
    let docs = `COMMAND DOCS\n***\n You can use the following commands followed by to query for information about the world.
                Some are not implemented yet and will return null. Respond with only the command name to request information.\n`;
    for (let command of commandsList) {
        docs += command.name + ': ' + command.description + '\n';
    }
    return docs + '\n***\n';
}