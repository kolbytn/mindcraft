import { Vec3 } from 'vec3';
import { Camera } from "../utils/camera.js";
import fs from 'fs';
import { log } from './library/skills.js';
import * as world from './library/world.js';

const pad = (str) => {
    return '\n' + str + '\n';
}

export class VisionInterpreter {
    constructor(agent, allow_vision) {
        this.agent = agent;
        this.allow_vision = allow_vision;
        this.fp = './bots/'+agent.name+'/screenshots/';
    }

    async lookAtPlayer(player_name, direction) {
        const bot = this.agent.bot;
        const player = bot.players[player_name]?.entity;
        if (!player) {
            log(bot, `Could not find player ${player_name}`);
        }

        let filename;
        if (direction === 'with') {
            await bot.look(player.yaw, player.pitch);
            const camera = new Camera(bot, this.fp);
            await new Promise(resolve => setTimeout(resolve, 500));
            log(bot, `Looking in the same direction as ${player_name}`);
            filename = await camera.capture();
        } else {
            await bot.lookAt(new Vec3(player.position.x, player.position.y + player.height, player.position.z));
            const camera = new Camera(bot, this.fp);
            await new Promise(resolve => setTimeout(resolve, 500));
            log(bot, `Looking at player ${player_name}`);
            filename = await camera.capture();
        }

        if (!this.allow_vision || !this.agent.prompter.vision_model.sendVisionRequest) {
            log(this.agent.bot, "Vision is disabled. Using text-based environment description instead.");
            log(this.agent.bot, this._nearbyBlocks());
        } else {
            await this.analyzeImage(filename);
        }
    }

    async lookAtPosition(x, y, z) {
        const bot = this.agent.bot;
        await bot.lookAt(new Vec3(x, y + 2, z));
        const camera = new Camera(bot, this.fp);
        await new Promise(resolve => setTimeout(resolve, 500));
        log(bot, `Looking at coordinate ${x, y, z}`);

        let filename = await camera.capture();

        if (!this.allow_vision || !this.agent.prompter.vision_model.sendVisionRequest) {
            log(this.agent.bot, "Vision is disabled. Using text-based environment description instead.");
            log(this.agent.bot, this._nearbyBlocks());
        } else {
            await this.analyzeImage(filename);
        }
    }

    async analyzeImage(filename) {
        let prompt = this.agent.prompter.profile.image_conversing;
        let res = null;

        try {
            const bot = this.agent.bot;
            const imageBuffer = fs.readFileSync(`${this.fp}/${filename}.jpg`);
            const messages = this.agent.history.getHistory();
            res = await this.agent.prompter.vision_model.sendVisionRequest(messages, prompt, imageBuffer);
            log(bot, res);
        } catch (error) {
            log(this.agent.bot, `Error analyzing image: ${error.message}`);
        }
    }

    _nearbyBlocks() {
        const bot = this.agent.bot;
        let res = 'NEARBY_BLOCKS';
        
        let blocks = world.getNearbyBlockTypes(bot);
        for (let i = 0; i < blocks.length; i++) {
            res += `\n- ${blocks[i]}`;
        }
        if (blocks.length == 0) {
            res += ': none';
        } else {
            // Environmental Awareness
            res += '\n- ' + world.getSurroundingBlocks(bot).join('\n- ')
            res += `\n- First Solid Block Above Head: ${world.getFirstBlockAboveHead(bot, null, 32)}`;
        }        
        return pad(res);
    }
} 