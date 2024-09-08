import pf from 'mineflayer-pathfinder';
import Vec3 from 'vec3';
import { log } from '../log.js';

export async function goToSurface(bot) {
    bot.pathfinder.setMovements(new pf.Movements(bot));

    while (true) {
        const pos = bot.entity.position;
        
        if (isAtSurface(bot)) {
            log(bot, `You have reached the surface.`);
            return true
        }

        const goal = new pf.goals.GoalY(pos.y + 1);
        try {
            await bot.pathfinder.goto(goal);
        } catch (error) {
            log(bot, `Failed to reach the surface`);
            return false
        }
    }
}

function isAtSurface(bot) {
    const pos = bot.entity.position;
    const worldHeight = 320
    
    for (let y = Math.floor(pos.y) + 1; y <= worldHeight; y++) {
        const block = bot.blockAt(new Vec3(pos.x, y, pos.z));
        if (block && block.name !== 'air' && block.name !== 'cave_air') {
            return false;
        }
    }
    return true;
}
