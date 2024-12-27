import mineflayer from 'mineflayer';
import { Vec3 } from 'vec3';



async function checkBuildingBlueprint(bot, blueprint) {
    /**
     * Checks if a Minecraft building matches a given blueprint using Mineflayer.
     *
     * @param {mineflayer.Bot} bot - The Mineflayer bot instance.
     * @param {object} blueprint - The blueprint object.
     * @returns {Promise<boolean>} - True if the building matches, false otherwise.
     */

    const mismatches = [];

    for (const levelData of blueprint.levels) {
        const levelNum = levelData.level;
        const startCoords = levelData.coordinates;
        const placement = levelData.placement;

        for (let zOffset = 0; zOffset < placement.length; zOffset++) {
            const row = placement[zOffset];
            for (let xOffset = 0; xOffset < row.length; xOffset++) {
                const blockName = row[xOffset];
                const expectedBlockId = getBlockIdFromName(bot, blockName);

                if (expectedBlockId === undefined) {
                    console.warn(`Warning: Unknown block name '${blockName}' in blueprint. Skipping.`);
                    continue;
                }

                const x = startCoords[0] + xOffset;
                const y = startCoords[1] + levelNum;
                const z = startCoords[2] + zOffset;

                try {
                    const blockAtLocation = await bot.blockAt(new Vec3(x, y, z));
                    if (!blockAtLocation || blockAtLocation.type !== expectedBlockId) {
                        mismatches.push({
                            level: levelNum,
                            coordinates: [x, y, z],
                            expected: blockName,
                            actual: blockAtLocation ? bot.registry.blocks[blockAtLocation.type].name : 'air' // Assuming air if no block
                        });
                    }
                } catch (err) {
                    console.error(`Error getting block at (${x}, ${y}, ${z}):`, err);
                    return false; // Stop checking if there's an issue getting blocks
                }
            }
        }
    }

    if (mismatches.length > 0) {
        console.log("Building does not match the blueprint. Found the following mismatches:");
        mismatches.forEach(mismatch => {
            console.log(`  Level ${mismatch.level}, Coordinates ${mismatch.coordinates.join(', ')}: Expected '${mismatch.expected}', Found '${mismatch.actual}'`);
        });
        return false;
    } else {
        console.log("Building matches the blueprint!");
        return true;
    }
}

function getBlockIdFromName(bot, blockName) {
    /**
     * Gets the numerical block ID from a string block name using the bot's registry.
     * @param {mineflayer.Bot} bot - The Mineflayer bot instance.
     * @param {string} blockName - The name of the block (case-insensitive).
     * @returns {number|undefined} - The block ID, or undefined if not found.
     */
    const blockInfo = bot.registry.blocksByName[blockName.toLowerCase().replace(/ /g, '_')];
    return blockInfo ? blockInfo.id : undefined;
}

// Example usage (replace with your bot login and server details)
const blueprintData = {
    "materials": {
        "plank": {
            "id": "oak_plank",
            "number": 20
        },
        "door": {
            "id": "oak_door",
            "number": 1
        }
    },
    "levels": [
        {
            "level": 0,
            "coordinates": [142, -60, -179],
            "placement":
            [
                ["stone", "stone", "oak_door", "stone", "stone"],
                ["stone", "air", "air", "air", "stone"],
                ["stone", "air", "air", "air", "stone"],
                ["stone", "stone", "stone", "stone", "stone"]
            ]
        },
        {
            "level": 1,
            "coordinates": [142, -59, -179],
            "placement":
            [
                ["stone", "stone", "air", "stone", "stone"],
                ["stone", "air", "air", "air", "stone"],
                ["stone", "air", "air", "air", "stone"],
                ["stone", "stone", "stone", "stone", "stone"]
            ]
        },
        {
            "level": 2,
            "coordinates": [142, -58, -179],
            "placement":
            [
                ["oak_plank", "oak_plank", "oak_plank", "oak_plank", "oak_plank"],
                ["oak_plank", "oak_plank", "oak_plank", "oak_plank", "oak_plank"],
                ["oak_plank", "oak_plank", "oak_plank", "oak_plank", "oak_plank"],
                ["oak_plank", "oak_plank", "oak_plank", "oak_plank", "oak_plank"]
            ]
        }
    ]
};

const bot = mineflayer.createBot({
    host: 'localhost', // Replace with your server IP or hostname
    port: 55916,       // Replace with your server port
    username: 'andy', // Replace with your bot's username
    // password: 'your_bot_password' // Only if the server has online-mode=true
});

bot.on('spawn', async () => {
    console.log("Bot spawned. Starting blueprint check...");
    const matchesBlueprint = await checkBuildingBlueprint(bot, blueprintData);
    console.log(`Blueprint check result: ${matchesBlueprint}`);
    bot.quit(); // Disconnect the bot after checking
});

bot.on('kicked', (reason, loggedIn) => {
    console.log(`Bot kicked: ${reason}, loggedIn: ${loggedIn}`);
});

bot.on('error', err => {
    console.log(`Bot error: ${err}`);
});