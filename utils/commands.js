import { getStats, getInventory, getBlocks, getNearbyEntities, getCraftable } from './context.js';
import { currentCode, writeCode } from '../act.js';

const pad = (str) => {
    return '\n\`\`\`\n' + str + '\n\`\`\`';
}

const commandsList = [
    {
        name: "!stats",
        description: "Get the bot's stats (name, health, food, saturation, armor, held item, position, velocity, gamemode, experience, level, effects).", 
        perform: function (bot, user, turns) {
            return pad(getStats(bot));
        }
    },
    {
        name: "!inventory",
        description: "Get the bot's inventory.",
        perform: function (bot, user, turns) {
            return pad(getInventory(bot));
        }
    },
    {
        name: "!blocks",
        description: "Get the blocks near the bot.",
        perform: function (bot, user, turns) {
            return pad(getBlocks(bot));
        }
    },
    {
        name: "!craftable",
        description: "Get the craftable items with the bot's inventory.",
        perform: function (bot, user, turns) {
            return pad(getCraftable(bot));
        }
    },
    {
        name: "!entities",
        description: "Get the nearby players and entities.",
        perform: function (bot, user, turns) {
            return pad(getNearbyEntities(bot));
        }
    },
    {
        name: "!action",
        description: "Get the currently executing code.",
        perform: function (bot, user, turns) {
            return pad(currentCode(bot));
        }
    },
    {
        name: "!execute",
        description: "Write javascript code to move, mine, build, or do anything else in the minecraft world. Example usage: \n!execute\n\`\`\`\nCODE\n\`\`\`",
        perform: function (bot, user, turns) {
            return writeCode(bot, user, turns);
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

export function containsCommand(message) {
    for (let command of commandsList) {
        if (message.includes(command.name)) {
            return command.name;
        }
    }
    return null;
}

export function getCommandDocs() {
    let docs = `COMMAND DOCS\n***\n You can use the following commands to query for information about the world.
                The first word of your response must be a command name in order to use commands. \n`;
    for (let command of commandsList) {
        docs += command.name + ': ' + command.description + '\n';
    }
    return docs + '\n***\n';
}