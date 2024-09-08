import * as world from "../world.js";

/**
 * Automatically places a torch if the bot's current position is dark enough.
 * 
 * This function checks if a torch should be placed using the `shouldPlaceTorch` function
 * from the world module. If a torch is needed, it attempts to place one at the bot's
 * current position.
 * 
 * @param {Bot} bot - The Mineflayer bot instance.
 * @returns {Promise<boolean>} - Returns true if a torch was successfully placed, false otherwise.
 */
export async function autoLight(bot) {
    if (world.shouldPlaceTorch(bot)) {
        try {
            const pos = world.getPosition(bot);
            return await placeBlock(bot, 'torch', pos.x, pos.y, pos.z, 'bottom', true);
        } catch (err) {return false;}
    }
    return false;
}