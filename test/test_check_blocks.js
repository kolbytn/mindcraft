import mineflayer from 'mineflayer';
import { Vec3 } from 'vec3';
import { ConstructionTaskValidator, Blueprint } from '../src/agent/tasks.js';
import { Agent } from '../src/agent/agent.js';

const bot = mineflayer.createBot({
    host: 'localhost', // Replace with your server IP or hostname
    port: 55916,       // Replace with your server port
    username: 'andy', // Replace with your bot's username
    // password: 'your_bot_password' // Only if the server has online-mode=true
});

bot.on('spawn', async () => {
    bot.chat("/setblock ~ ~ ~ stone");
    console.log("Bot spawned. Starting blueprint check...");
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const blockAtLocation = await bot.blockAt(new Vec3(142, -60, -179));
    console.log(blockAtLocation);
    const blueprint = new Blueprint(blueprintData);
    console.log(blueprint.explain());
    console.log(blueprint.explainLevel(0));
    try {
        const check_level = await blueprint.checkLevel(bot, 0);
        console.log(check_level);
        let check_blueprint = await blueprint.check(bot);
        console.log(check_blueprint);
        let level_diff = await blueprint.explainLevelDifference(bot, 0);
        console.log(level_diff);
        let blueprint_diff = await blueprint.explainBlueprintDifference(bot);
        console.log(blueprint_diff);
    } catch (err) {
        console.error("Error checking blueprint:", err);
    }
    // console.log(blueprint.checkLevel(bot, 0));
    // console.log(blueprint.check(bot));
    // console.log(blueprint.explainBlueprintDifference(bot, blueprintData));
    // console.log(blueprint.explainLevelDifference(bot, 0));
    bot.quit();
});

async function checkBluepint(bot, blueprintData) {
    const materials = blueprintData.materials;
    const levels = blueprintData.levels;
    const mismatches = [];
    const matches = [];

    for (let i = 0; i < levels.length; i++) {
        const levelData = levels[i];
        const result = await checkLevelBlueprint(bot, levelData);
        mismatches.push(...result.mismatches);
        matches.push(...result.matches);
    }
    return {
        "mismatches": mismatches,
        "matches": matches
    };
}

async function checkLevelBlueprint(bot, levelData) {
    const startCoords = levelData.coordinates;
    const placement = levelData.placement;
    const mismatches = [];
    const matches = [];

    for (let zOffset = 0; zOffset < placement.length; zOffset++) {
        const row = placement[zOffset];
        for (let xOffset = 0; xOffset < row.length; xOffset++) {
            const blockName = row[xOffset];

            const x = startCoords[0] + xOffset;
            const y = startCoords[1];
            const z = startCoords[2] + zOffset;

            try {
                const blockAtLocation = await bot.blockAt(new Vec3(x, y, z));
                if (!blockAtLocation || blockAtLocation.name !== blockName) {
                    mismatches.push({
                        level: levelData.level,
                        coordinates: [x, y, z],
                        expected: blockName,
                        actual: blockAtLocation ? bot.registry.blocks[blockAtLocation.type].name : 'air' // Assuming air if no block
                    });
                } else {
                    matches.push({
                        level: levelData.level,
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
    return {
        "mismatches": mismatches,
        "matches": matches
    };
}

const blueprintData = {
    "materials": {
        "oak_planks": 20, 
        "oak_door": 1,
        "stone": 26,
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
                ["stone", "stone", "oak_door", "stone", "stone"],
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
                ["oak_planks", "oak_planks", "oak_planks", "oak_planks", "oak_planks"],
                ["oak_planks", "oak_planks", "oak_planks", "oak_planks", "oak_planks"],
                ["oak_planks", "oak_planks", "oak_planks", "oak_planks", "oak_planks"],
                ["oak_planks", "oak_planks", "oak_planks", "oak_planks", "oak_planks"]
            ]
        }
    ]
};



