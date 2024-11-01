import mineflayer from 'mineflayer';
import settings from '../settings.js';

const bot = mineflayer.createBot({
    username: "andy",
    host: settings.host,
    port: settings.port,
    auth: settings.auth,
    version: "1.20.4",
});

bot.once('spawn', () => {
    bot.chat('/gamemode creative'); // Request creative mode
    bot.chat('/give andy minecraft:stone 64'); // Request 64 stone blocks

    // Listen for the game mode change confirmation
    const handleGameMode = (mode) => {
        if (mode === 'creative') {
            console.log('Switched to creative mode.');

            setTimeout(() => {
                const slot = 0; // Hotbar slot 1 (index 0)
                const item = {
                    // Using namespaced ID for better compatibility
                    id: 1,
                    count: 64
                };

                bot.creative.setInventorySlot(slot, item, (err) => {
                    if (err) {
                        console.error('Error setting inventory slot:', err);
                    } else {
                        console.log(`Inventory slot ${slot} set successfully with ${item.count} ${item.name}(s)!`);
                    }
                });
            }, 2000); // Adjust the timeout as needed
        }
    };

    // Depending on Mineflayer's event for game mode changes, adjust accordingly
    // Here's a generic example; you may need to refer to the documentation for exact events
    bot.on('game_mode', handleGameMode);

    // Alternatively, if there's no direct event, use a timeout or another method to confirm
});


// import mineflayer from 'mineflayer';
// import settings from '../settings.js';

// let bot = mineflayer.createBot({
//     username: "andy",

//     host: settings.host,
//     port: settings.port,
//     auth: settings.auth,

//     version: "1.20.4",
// });

// bot.once('spawn', () => {
//   bot.chat('/gamemode creative'); // Ensure creative mode

//   setTimeout(() => {
//     const slot = 0; // Example: Hotbar slot 1
//     const item = {
//       id: 1, // Example: Stone
//       count: 64
//     };

//     bot.creative.setInventorySlot(slot, item, {"timout": 10000 }, (err) => {
//       if (err) {
//         console.error('Error setting inventory slot:', err);
//       } else {
//         console.log('Inventory slot set successfully!');
//       }
//     });
//   }, 2000); // Wait a bit after spawn
// });