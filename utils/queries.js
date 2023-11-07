import { getStats, getInventory, getBlocks, getNearbyEntities, getCraftable } from './context.js';

const pad = (str) => {
    return '\n' + str + '\n';
}

const queryList = [
    {
        name: "!stats",
        description: "Get your bot's stats", 
        perform: function (bot) {
            return pad(getStats(bot));
        }
    },
    {
        name: "!inventory",
        description: "Get your bot's inventory.",
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
];

const queryMap = {};
for (let query of queryList) {
    queryMap[query.name] = query;
}

export function getQuery(name) {
    return queryMap[name];
}

export function containsQuery(message) {
    for (let query of queryList) {
        if (message.includes(query.name)) {
            return query.name;
        }
    }
    return null;
}

export function getQueryDocs() {
    let docs = `\n*QUERY DOCS\n You can use the following commands to query for information about the world.
                Use the query name in your response and the next input will have the requested information.\n`;
    for (let query of queryList) {
        docs += query.name + ': ' + query.description + '\n';
    }
    return docs + '*\n';
}