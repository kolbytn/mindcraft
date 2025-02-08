import mineflayer from "mineflayer";

const bot = mineflayer.createBot({
    host: 'localhost', // Replace with your server IP or hostname
    port: 55916,       // Replace with your server port
    username: 'andy', // Replace with your bot's username
    // password: 'your_bot_password' // Only if the server has online-mode=true
});

bot.on('spawn', async () => {
    // generate a blueprint
    const blueprint = {
        "levels": [
            {
                "level": 0,
                "coordinates": [142, -60, -179],
                "placement": [
                    ["stone", "stone", "oak_door", "stone", "stone"],
                    ["stone", "air", "air", "air", "stone"],
                    ["stone", "air", "air", "air", "stone"],
                    ["stone", "stone", "stone", "stone", "stone"]
                ]
            },
            {
                "level": 1,
                "coordinates": [142, -59, -179],
                "placement": [
                    ["stone", "stone", "air", "stone", "stone"],
                    ["stone", "air", "air", "air", "stone"],
                    ["stone", "air", "air", "air", "stone"],
                    ["stone", "stone", "stone", "stone", "stone"]
                ]
            },
            {
                "level": 2,
                "coordinates": [142, -58, -179],
                "placement": [
                    ["stone", "stone", "stone", "stone", "stone"],
                    ["stone", "stone", "stone", "stone", "stone"],
                    ["stone", "stone", "stone", "stone", "stone"],
                    ["stone", "stone", "stone", "stone", "stone"],
                ]
            }
        ]
    };

    // have andy build the blueprint automatically
    const result = autoBuild(blueprint);
    // const result = clearHouse(blueprint)
    const commands = result.commands;
    const nearbyPosition = result.nearbyPosition;
    for (const command of commands) {
        bot.chat(command);
    }

    console.log(commands.slice(-10));

    // Print out the location nearby the blueprint
    console.log(`tp ${nearbyPosition.x} ${nearbyPosition.y} ${nearbyPosition.z}`)


});





/**
 * Takes in the blueprint, and then converts it into a set of /setblock commands for the bot to follow
 * @Returns: An object containing the setblock commands as a list of strings, and a position nearby the blueprint but not in it
 * @param blueprint
 */
export function autoBuild(blueprint) {
    const commands = [];

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    for (const level of blueprint.levels) {
        // console.log(level.level)
        const baseX = level.coordinates[0];
        const baseY = level.coordinates[1];
        const baseZ = level.coordinates[2];
        const placement = level.placement;

        // Update bounds
        minX = Math.min(minX, baseX);
        maxX = Math.max(maxX, baseX + placement[0].length - 1);
        minY = Math.min(minY, baseY);
        maxY = Math.max(maxY, baseY);
        minZ = Math.min(minZ, baseZ);
        maxZ = Math.max(maxZ, baseZ + placement.length - 1);

        // Loop through the 2D placement array
        for (let z = 0; z < placement.length; z++) {
            for (let x = 0; x < placement[z].length; x++) {
                const blockType = placement[z][x];
                if (blockType) {
                    const setblockCommand = `/setblock ${baseX + x} ${baseY} ${baseZ + z} ${blockType}`;
                    commands.push(setblockCommand);
                }
            }
        }
    }

    // Calculate a position nearby the blueprint but not in it
    const nearbyPosition = {
        x: maxX + 5, // Move 5 blocks to the right
        y: minY,     // Stay on the lowest level of the blueprint
        z: minZ      // Stay aligned with the front of the blueprint
    };

    return { commands, nearbyPosition};
}


/**
 * Takes in a blueprint, and returns a set of commands to clear up the space.
 *
 */
export function autoDelete(blueprint) {
    const commands = [];

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    for (const level of blueprint.levels) {
        const baseX = level.coordinates[0];
        const baseY = level.coordinates[1];
        const baseZ = level.coordinates[2];
        const placement = level.placement;

        // Update bounds
        minX = Math.min(minX, baseX);
        maxX = Math.max(maxX, baseX + placement[0].length - 1);
        minY = Math.min(minY, baseY);
        maxY = Math.max(maxY, baseY);
        minZ = Math.min(minZ, baseZ);
        maxZ = Math.max(maxZ, baseZ + placement.length - 1);

        // Loop through the 2D placement array
        for (let z = 0; z < placement.length; z++) {
            for (let x = 0; x < placement[z].length; x++) {
                const blockType = placement[z][x];
                if (blockType) {
                    const setblockCommand = `/setblock ${baseX + x} ${baseY} ${baseZ + z} air`;
                    commands.push(setblockCommand);
                }
            }
        }
    }

    // Calculate a position nearby the blueprint but not in it
    const nearbyPosition = {
        x: maxX + 5, // Move 5 blocks to the right
        y: minY,     // Stay on the lowest level of the blueprint
        z: minZ      // Stay aligned with the front of the blueprint
    };

    return { commands, nearbyPosition };
}


