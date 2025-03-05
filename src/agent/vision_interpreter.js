import { Vec3 } from 'vec3';
import { Camera } from "../utils/camera.js";
import fs from 'fs';

const RENDER_TIME = 1000;

export class VisionInterpreter {
    constructor(agent, allow_vision) {
        this.agent = agent;
        this.allow_vision = allow_vision;
        this.fp = './bots/'+agent.name+'/screenshots/';
    }

    async lookAtPlayer(player_name, direction) {
        if (!this.allow_vision || !this.agent.prompter.vision_model.sendVisionRequest) {
            return "Vision is disabled. Use other methods to describe the environment.";
        }
        let result = "";
        const bot = this.agent.bot;
        const player = bot.players[player_name]?.entity;
        if (!player) {
            return `Could not find player ${player_name}`;
        }

        let filename;
        if (direction === 'with') {
            await bot.look(player.yaw, player.pitch);
            const camera = new Camera(bot, this.fp);
            await new Promise(resolve => setTimeout(resolve, RENDER_TIME));
            result = `Looking in the same direction as ${player_name}\n`;
            filename = await camera.capture();
        } else {
            await bot.lookAt(new Vec3(player.position.x, player.position.y + player.height, player.position.z));
            const camera = new Camera(bot, this.fp);
            await new Promise(resolve => setTimeout(resolve, RENDER_TIME));
            result = `Looking at player ${player_name}\n`;
            filename = await camera.capture();

        }

        return result + `Image analysis: "${await this.analyzeImage(filename)}"`;
    }

    async lookAtPosition(x, y, z) {
        if (!this.allow_vision || !this.agent.prompter.vision_model.sendVisionRequest) {
            return "Vision is disabled. Use other methods to describe the environment.";
        }
        let result = "";
        const bot = this.agent.bot;
        await bot.lookAt(new Vec3(x, y + 2, z));
        const camera = new Camera(bot, this.fp);
        await new Promise(resolve => setTimeout(resolve, RENDER_TIME));
        result = `Looking at coordinate ${x, y, z}\n`;

        let filename = await camera.capture();

        return result + `Image analysis: "${await this.analyzeImage(filename)}"`;
    }

    async analyzeImage(filename) {
        try {
            const imageBuffer = fs.readFileSync(`${this.fp}/${filename}.jpg`);
            const messages = this.agent.history.getHistory();

            return await this.agent.prompter.promptVision(messages, imageBuffer);

        } catch (error) {
            console.warn('Error reading image:', error);
            return `Error reading image: ${error.message}`;
        }
    }
} 