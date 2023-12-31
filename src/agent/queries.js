import { getNearestBlock, getNearbyMobTypes, getNearbyPlayerNames, getNearbyBlockTypes, getInventoryCounts } from './world.js';
import { getAllItems } from '../utils/mcdata.js';


const pad = (str) => {
    return '\n' + str + '\n';
}

const queryList = [
    {
        name: "!stats",
        description: "Get your bot's stats", 
        perform: function (agent) {
            let bot = agent.bot;
            let res = 'STATS';
            res += `\n- position: x:${bot.entity.position.x}, y:${bot.entity.position.y}, z:${bot.entity.position.z}`;
            res += `\n- health: ${bot.health} / 20`;
            if (bot.time.timeOfDay < 6000) {
                res += '\n- time: Morning';
            } else if (bot.time.timeOfDay < 12000) {
                res += '\n- time: Afternoon';
            } else {
                res += '\n- time: Night';
            }
            return pad(res);
        }
    },
    {
        name: "!inventory",
        description: "Get your bot's inventory.",
        perform: function (agent) {
            let bot = agent.bot;
            let inventory = getInventoryCounts(bot);
            let res = 'INVENTORY';
            for (const item in inventory) {
                if (inventory[item] && inventory[item] > 0)
                    res += `\n- ${item}: ${inventory[item]}`;
            }
            if (res == 'INVENTORY') {
                res += ': none';
            }
            return pad(res);
        }
    },
    {
        name: "!blocks",
        description: "Get the blocks near the bot.",
        perform: function (agent) {
            let bot = agent.bot;
            let res = 'NEARBY_BLOCKS';
            let blocks = getNearbyBlockTypes(bot);
            for (let i = 0; i < blocks.length; i++) {
                res += `\n- ${blocks[i]}`;
            }
            if (blocks.length == 0) {
                res += ': none';
            }
            return pad(res);
        }
    },
    {
        name: "!craftable",
        description: "Get the craftable items with the bot's inventory.",
        perform: function (agent) {
            const bot = agent.bot;
            const table = getNearestBlock(bot, 'crafting_table');
            let res = 'CRAFTABLE_ITEMS';
            for (const item of getAllItems()) {
                let recipes = bot.recipesFor(item.id, null, 1, table);
                if (recipes.length > 0) {
                    res += `\n- ${item.name}`;
                }
            }
            if (res == 'CRAFTABLE_ITEMS') {
                res += ': none';
            }
            return pad(res);
        }
    },
    {
        name: "!entities",
        description: "Get the nearby players and entities.",
        perform: function (agent) {
            let bot = agent.bot;
            let res = 'NEARBY_ENTITIES';
            for (const entity of getNearbyPlayerNames(bot)) {
                res += `\n- player: ${entity}`;
            }
            for (const entity of getNearbyMobTypes(bot)) {
                res += `\n- mob: ${entity}`;
            }
            if (res == 'NEARBY_ENTITIES') {
                res += ': none';
            }
            return pad(res);
        }
    },
    {
        name: "!action",
        description: "Get the currently executing code.",
        perform: function (agent) {
            return pad("Current code:\n`" + agent.coder.current_code +"`");
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
    let docs = `\n*QUERY DOCS\n You can use the following commands to query for information about the world. Use the query name in your response and the next input will have the requested information.\n`;
    for (let query of queryList) {
        docs += query.name + ': ' + query.description + '\n';
    }
    return docs + '*\n';
}