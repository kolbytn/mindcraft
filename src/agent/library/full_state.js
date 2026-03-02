import { 
    getPosition,
    getBiomeName,
    getNearbyPlayerNames,
    getInventoryCounts,
    getNearbyEntityTypes,
    getBlockAtPosition,
    getFirstBlockAboveHead
} from "./world.js";
import convoManager from '../conversation.js';

export function getFullState(agent) {
    const bot = agent.bot;

    const pos = getPosition(bot);
    const position = {
        x: Number(pos.x.toFixed(2)),
        y: Number(pos.y.toFixed(2)),
        z: Number(pos.z.toFixed(2))
    };

    let weather = 'Clear';
    if (bot.thunderState > 0) weather = 'Thunderstorm';
    else if (bot.rainState > 0) weather = 'Rain';

    let timeLabel = 'Night';
    if (bot.time.timeOfDay < 6000) timeLabel = 'Morning';
    else if (bot.time.timeOfDay < 12000) timeLabel = 'Afternoon';

    const below = getBlockAtPosition(bot, 0, -1, 0).name;
    const legs = getBlockAtPosition(bot, 0, 0, 0).name;
    const head = getBlockAtPosition(bot, 0, 1, 0).name;

    let players = getNearbyPlayerNames(bot);
    let bots = convoManager.getInGameAgents().filter(b => b !== agent.name);
    players = players.filter(p => !bots.includes(p));

    const helmet = bot.inventory.slots[5];
    const chestplate = bot.inventory.slots[6];
    const leggings = bot.inventory.slots[7];
    const boots = bot.inventory.slots[8];

    const state = {
        name: agent.name,
        gameplay: {
            position,
            dimension: bot.game.dimension,
            gamemode: bot.game.gameMode,
            health: Math.round(bot.health),
            hunger: Math.round(bot.food),
            biome: getBiomeName(bot),
            weather,
            timeOfDay: bot.time.timeOfDay,
            timeLabel
        },
        action: {
            current: agent.isIdle() ? 'Idle' : agent.actions.currentActionLabel,
            isIdle: agent.isIdle(),
            resumeName: agent.actions.resume_name || null
        },
        selfPrompter: {
            prompt: agent.self_prompter.prompt || '',
            state: agent.self_prompter.state
        },
        surroundings: {
            below,
            legs,
            head,
            firstBlockAboveHead: getFirstBlockAboveHead(bot, null, 32)
        },
        inventory: {
            counts: getInventoryCounts(bot),
            stacksUsed: bot.inventory.items().length,
            totalSlots: bot.inventory.slots.length,
            equipment: {
                helmet: helmet ? helmet.name : null,
                chestplate: chestplate ? chestplate.name : null,
                leggings: leggings ? leggings.name : null,
                boots: boots ? boots.name : null,
                mainHand: bot.heldItem ? bot.heldItem.name : null
            }
        },
        nearby: {
            humanPlayers: players,
            botPlayers: bots,
            entityTypes: getNearbyEntityTypes(bot).filter(t => t !== 'player' && t !== 'item'),
        },
        modes: {
            summary: bot.modes.getMiniDocs()
        }
    };

    return state;
}