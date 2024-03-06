import { Vec3 } from 'vec3';
import * as skills from '../library/skills.js';
import * as world from '../library/world.js';
import * as mc from '../../utils/mcdata.js';
import { blockSatisfied, getTypeOfGeneric } from './utils.js';


export class BuildGoal {
    constructor(agent) {
        this.agent = agent;
    }

    rotateXZ(x, z, orientation, sizex, sizez) {
        if (orientation === 0) return [x, z];
        if (orientation === 1) return [z, sizex-x-1];
        if (orientation === 2) return [sizex-x-1, sizez-z-1];
        if (orientation === 3) return [sizez-z-1, x];
    }

    async executeNext(goal, position=null, orientation=null) {
        let sizex = goal.blocks[0][0].length;
        let sizez = goal.blocks[0].length;
        let sizey = goal.blocks.length;
        if (!position) {
            for (let x = 0; x < sizex - 1; x++) {
                position = world.getNearestFreeSpace(this.agent.bot, sizex - x, 16);
                if (position) break;
            }
        }
        if (orientation === null) {
            orientation = Math.floor(Math.random() * 4);
        }

        let inventory = world.getInventoryCounts(this.agent.bot);
        let missing = [];
        let acted = false;
        for (let y = goal.offset; y < sizey+goal.offset; y++) {
            for (let z = 0; z < sizez; z++) {
                for (let x = 0; x < sizex; x++) {

                    let [rx, rz] = this.rotateXZ(x, z, orientation, sizex, sizez);
                    let ry = y - goal.offset;
                    let block_name = goal.blocks[ry][rz][rx];
                    if (block_name === null || block_name === '') continue;

                    let world_pos = new Vec3(position.x + x, position.y + y, position.z + z);
                    let current_block = this.agent.bot.blockAt(world_pos);

                    let res = null;
                    if (!blockSatisfied(block_name, current_block)) {
                        acted = true;

                        if (!this.agent.isIdle())
                            return {missing: missing, acted: acted, position: position, orientation: orientation};
                        res = await this.agent.coder.execute(async () => {
                            await skills.breakBlockAt(this.agent.bot, world_pos.x, world_pos.y, world_pos.z);
                        });
                        if (res.interrupted)
                            return {missing: missing, acted: acted, position: position, orientation: orientation};

                        let block_typed = getTypeOfGeneric(this.agent.bot, block_name);
                        if (inventory[block_typed] > 0) {

                            if (!this.agent.isIdle())
                                return {missing: missing, acted: acted, position: position, orientation: orientation};
                            await this.agent.coder.execute(async () => {
                                await skills.placeBlock(this.agent.bot, block_typed, world_pos.x, world_pos.y, world_pos.z);
                            });
                            if (res.interrupted)
                                return {missing: missing, acted: acted, position: position, orientation: orientation};

                        } else {
                            missing.push(block_typed);
                        }
                    }
                }
            }
        }
        return {missing: missing, acted: acted, position: position, orientation: orientation};
    }

}