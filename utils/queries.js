import { getStats, getInventory, getBlocks, getNearbyEntities, getCraftable } from './context.js';

const pad = (str) => {
    return '\n' + str + '\n';
}

const queryList = [
    {
        name: "!stats",
        description: "Get your bot's stats", 
        perform: function (agent) {
            return pad(getStats(agent.bot));
        }
    },
    {
        name: "!inventory",
        description: "Get your bot's inventory.",
        perform: function (agent) {
            return pad(getInventory(agent.bot));
        }
    },
    {
        name: "!blocks",
        description: "Get the blocks near the bot.",
        perform: function (agent) {
            return pad(getBlocks(agent.bot));
        }
    },
    {
        name: "!craftable",
        description: "Get the craftable items with the bot's inventory.",
        perform: function (agent) {
            return pad(getCraftable(agent.bot));
        }
    },
    {
        name: "!entities",
        description: "Get the nearby players and entities.",
        perform: function (agent) {
            return pad(getNearbyEntities(agent.bot));
        }
    },
    {
        name: "!action",
        description: "Get the currently executing code.",
        perform: function (agent) {
            return pad("Current code:\n`" + agent.coder.current_code +"`");
        }
    },
    {
        name: "!events",
        description: "Get the bot's events and callbacks.",
        perform: function (agent) {
            let res = "Events:";
            for (let [event, callback, params] of agent.history.events) {
                res += `\n- ${event} -> ${callback.name}(${params})`;
            }
            return pad(res);
        }
    }
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