import { Vec3 } from 'vec3';
import fs from 'fs';

export class VisionInterpreter {
    constructor(agent, allow_vision) {
        this.agent = agent;
        this.allow_vision = allow_vision;
        this.fp = './bots/'+agent.name+'/screenshots/';
        if (allow_vision) {
            import("./camera.js").then(({ Camera }) => {
                try {
                    this.camera = new Camera(agent.bot, this.fp);
                    this.camera.on('error', (err) => {
                        console.warn(`[Vision] Camera async init failed: ${err.message}`);
                        console.warn('[Vision] Vision disabled — bots will continue without screenshot capability.');
                        this.allow_vision = false;
                        if (this.camera) this.camera.destroy();
                        this.camera = null;
                    });
                } catch (err) {
                    console.warn(`[Vision] Camera init failed (WebGL not available): ${err.message}`);
                    console.warn('[Vision] Vision disabled — bots will continue without screenshot capability.');
                    this.allow_vision = false;
                    this.camera = null;
                }
            }).catch((err) => {
                console.warn(`[Vision] Failed to load camera module: ${err.message}`);
                console.warn('[Vision] Vision disabled — prismarine-viewer/canvas not available.');
                this.allow_vision = false;
                this.camera = null;
            });
        }
    }

    async lookAtPlayer(player_name, direction) {
        if (!this.allow_vision || !this.camera || !this.agent.prompter.vision_model?.sendVisionRequest) {
            return "Vision is disabled or camera not ready. Use other methods to describe the environment.";
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
            result = `Looking in the same direction as ${player_name}\n`;
            filename = await this.camera.capture();
        } else {
            await bot.lookAt(new Vec3(player.position.x, player.position.y + player.height, player.position.z));
            result = `Looking at player ${player_name}\n`;
            filename = await this.camera.capture();

        }

        return result + `Image analysis: "${await this.analyzeImage(filename)}"`;
    }

    async lookAtPosition(x, y, z) {
        if (!this.allow_vision || !this.camera || !this.agent.prompter.vision_model?.sendVisionRequest) {
            return "Vision is disabled or camera not ready. Use other methods to describe the environment.";
        }
        let result = "";
        const bot = this.agent.bot;
        await bot.lookAt(new Vec3(x, y + 2, z));
        result = `Looking at coordinate ${x}, ${y}, ${z}\n`;

        let filename = await this.camera.capture();

        return result + `Image analysis: "${await this.analyzeImage(filename)}"`;
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
            const imageBuffer = fs.readFileSync(`${this.fp}/${filename}.jpg`);
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