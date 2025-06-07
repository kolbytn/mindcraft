import { Vec3 } from 'vec3';
import { Camera } from "./camera.js";
import fs from 'fs';
import path from 'path';

export class VisionInterpreter {
    constructor(agent, vision_mode) {
        this.agent = agent;
        this.vision_mode = vision_mode;
        this.fp = './bots/'+agent.name+'/screenshots/';
        if (this.vision_mode !== 'off') {
            this.camera = new Camera(agent.bot, this.fp);
        }
    }

    async lookAtPlayer(player_name, direction) {
        if (this.vision_mode === 'off') {
            return "Vision is disabled. Use other methods to describe the environment.";
        }
        if (!this.camera) {
            return "Camera is not initialized. Vision may be set to 'off'.";
        }
        if (!this.agent.prompter.vision_model.sendVisionRequest && this.vision_mode === 'prompted') {
            return "Vision requests are not enabled for the current model. Cannot analyze image.";
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
            result = `Looking in the same direction as ${player_name}.\n`;
            filename = await this.camera.capture();
            this.agent.latestScreenshotPath = filename;
        } else {
            await bot.lookAt(new Vec3(player.position.x, player.position.y + player.height, player.position.z));
            result = `Looking at player ${player_name}.\n`;
            filename = await this.camera.capture();
            this.agent.latestScreenshotPath = filename;
        }

        if (this.vision_mode === 'prompted') {
            return result + `Image analysis: "${await this.analyzeImage(filename)}"`;
        } else if (this.vision_mode === 'always') {
            return result + "Screenshot taken and stored.";
        }
        // Should not be reached if vision_mode is one of the expected values
        return "Error: Unknown vision mode.";
    }

    async lookAtPosition(x, y, z) {
        if (this.vision_mode === 'off') {
            return "Vision is disabled. Use other methods to describe the environment.";
        }
        if (!this.camera) {
            return "Camera is not initialized. Vision may be set to 'off'.";
        }
        if (!this.agent.prompter.vision_model.sendVisionRequest && this.vision_mode === 'prompted') {
            return "Vision requests are not enabled for the current model. Cannot analyze image.";
        }

        let result = "";
        const bot = this.agent.bot;
        await bot.lookAt(new Vec3(x, y + 2, z)); // lookAt requires y to be eye level, so +2 from feet
        result = `Looking at coordinate ${x}, ${y}, ${z}.\n`;

        let filename = await this.camera.capture();
        this.agent.latestScreenshotPath = filename;

        if (this.vision_mode === 'prompted') {
            return result + `Image analysis: "${await this.analyzeImage(filename)}"`;
        } else if (this.vision_mode === 'always') {
            return result + "Screenshot taken and stored.";
        }
        // Should not be reached if vision_mode is one of the expected values
        return "Error: Unknown vision mode.";
    }

    getCenterBlockInfo() {
        const bot = this.agent.bot;
        const maxDistance = 128; // Maximum distance to check for blocks
        const targetBlock = bot.blockAtCursor(maxDistance);
        
        if (targetBlock) {
            return `Block at center view: ${targetBlock.name} at (${targetBlock.position.x}, ${targetBlock.position.y}, ${targetBlock.position.z})`;
        } else {
            return "No block in center view";
        }
    }

    async analyzeImage(filename) {
        try {
            // filename already includes .jpg from camera.js
            const imageFullPath = path.join(this.fp, filename);
            const imageBuffer = fs.readFileSync(imageFullPath);
            const messages = this.agent.history.getHistory();

            const blockInfo = this.getCenterBlockInfo();
            const result = await this.agent.prompter.promptVision(messages, imageBuffer);
            return result + `\n${blockInfo}`;

        } catch (error) {
            console.warn('Error reading image:', error);
            return `Error reading image: ${error.message}`;
        }
    }
} 