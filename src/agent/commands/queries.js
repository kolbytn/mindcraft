import * as world from '../library/world.js';
import * as mc from '../../utils/mcdata.js';


const pad = (str) => {
    return '\n' + str + '\n';
}

// queries are commands that just return strings and don't affect anything in the world
export const queryList = [
    {
        name: "!stats",
        description: "Get your bot's location, health, hunger, and time of day.", 
        perform: function (agent) {
            let bot = agent.bot;
            let res = 'STATS';
            let pos = bot.entity.position;
            // display position to 2 decimal places
            res += `\n- Position: x: ${pos.x.toFixed(2)}, y: ${pos.y.toFixed(2)}, z: ${pos.z.toFixed(2)}`;
            res += `\n- Gamemode: ${bot.game.gameMode}`;
            res += `\n- Health: ${Math.round(bot.health)} / 20`;
            res += `\n- Hunger: ${Math.round(bot.food)} / 20`;
            res += `\n- Biome: ${world.getBiomeName(bot)}`;
            let weather = "Clear";
            if (bot.rainState > 0)
                weather = "Rain";
            if (bot.thunderState > 0)
                weather = "Thunderstorm";
            res += `\n- Weather: ${weather}`;
            // let block = bot.blockAt(pos);
            // res += `\n- Artficial light: ${block.skyLight}`;
            // res += `\n- Sky light: ${block.light}`;
            // light properties are bugged, they are not accurate

            if (bot.time.timeOfDay < 6000) {
                res += '\n- Time: Morning';
            } else if (bot.time.timeOfDay < 12000) {
                res += '\n- Time: Afternoon';
            } else {
                res += '\n- Time: Night';
            }

            let other_players = world.getNearbyPlayerNames(bot);
            if (other_players.length > 0) {
                res += '\n- Other Players: ' + other_players.join(', ');
            }

            res += '\n' + agent.bot.modes.getMiniDocs() + '\n';
            return pad(res);
        }
    },
    {
        name: "!inventory",
        description: "Get your bot's inventory.",
        perform: function (agent) {
            let bot = agent.bot;
            let inventory = world.getInventoryCounts(bot);
            let res = 'INVENTORY';
            for (const item in inventory) {
                if (inventory[item] && inventory[item] > 0)
                    res += `\n- ${item}: ${inventory[item]}`;
            }
            if (res === 'INVENTORY') {
                res += ': none';
            }
            else if (agent.bot.game.gameMode === 'creative') {
                res += '\n(You have infinite items in creative mode. You do not need to gather resources!!)';
            }

            let helmet = bot.inventory.slots[5];
            let chestplate = bot.inventory.slots[6];
            let leggings = bot.inventory.slots[7];
            let boots = bot.inventory.slots[8];
            res += '\nWEARING: ';
            if (helmet)
                res += `\nHead: ${helmet.name}`;
            if (chestplate)
                res += `\nTorso: ${chestplate.name}`;
            if (leggings)
                res += `\nLegs: ${leggings.name}`;
            if (boots)
                res += `\nFeet: ${boots.name}`;
            if (!helmet && !chestplate && !leggings && !boots)
                res += 'None';

            return pad(res);
        }
    },
    {
        name: "!nearbyBlocks",
        description: "Get the blocks near the bot.",
        params: {
            'range': { type: 'int', description: 'distance to search (optional).' },
        },
        perform: function (agent,range) {
            if (range === undefined)
                range = 16
            if (range > 64)
                range = 64
            let bot = agent.bot;
            let res = 'NEARBY_BLOCKS WITHIN '+range+" BLOCKS:";
            let blocks = world.getNearbyBlockCounts(bot,range);
            let listing = []
            for (let k in blocks) {
                res += `\n${k+": "+blocks[k]}`;
                listing.push(blocks[k])
            }
            if (listing.length == 0) {
                res += ': none';
            }
            return pad(res);
        }
    },
    {
        name: '!getBlockAtCoordinates',
        description: 'Get the type of block at a specific set of coordinates.',
        params: {
            'x': { type: 'int', description: 'The x coordinate of your destination.' },
            'y': { type: 'int', description: 'The y coordinate of your destination.' },
            'z': { type: 'int', description: 'The z coordinate of your destination.' }
        },
        perform: function (agent,x,y,z) {
            if (!x) {
                skills.log(agent.bot, `No x coordinate specified, make sure to include an x y and z coordinate.`);
                return;
            }
            if (!y) {
                skills.log(agent.bot, `No y coordinate specified, make sure to include an x y and z coordinate.`);
                return;
            }
            if (!z) {
                skills.log(agent.bot, `No z coordinate specified, make sure to include an x y and z coordinate.`);
                return;
            }
            return pad("the block at "+x+", "+y+", "+z+" is "+world.getBlockAtCoordinate(x,y,z))
        }
    },
    {
        name: "!craftable",
        description: "Get the craftable items with the bot's inventory.",
        perform: function (agent) {
            const bot = agent.bot;
            const table = world.getNearestBlock(bot, 'crafting_table');
            let res = 'CRAFTABLE_ITEMS';
            for (const item of mc.getAllItems()) {
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
            //for (const entity of world.getNearbyPlayerNames(bot)) {
                //res += `\n- player: ${entity}`;
            //}
            for (const entity of world.getNearbyEntities(bot)) {
                if (entity.name === 'item')
                    continue;
                if(entity.name === "player")
                    res += `\nplayer: ${entity.username}`;
                else
                    res += `\n${entity.type}: ${entity.name}`;
            }
            if (res == 'NEARBY_ENTITIES') {
                res += ': none';
            }
            return pad(res);
        }
    },
    {
        name: "!modes",
        description: "Get all available modes and their docs and see which are on/off.",
        perform: function (agent) {
            return agent.bot.modes.getDocs();
        }
    },
    {
        name: '!savedPlaces',
        description: 'List all saved locations.',
        perform: async function (agent) {
            return "Saved place names: " + agent.memory_bank.getKeys();
        }
    }
];
