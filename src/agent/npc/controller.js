import { readdirSync, readFileSync } from 'fs';
import { NPCData } from './data.js';
import { ItemGoal } from './item_goal.js';
import { BuildGoal } from './build_goal.js';
import { itemSatisfied } from './utils.js';


export class NPCContoller {
    constructor(agent) {
        this.agent = agent;
        this.data = NPCData.fromObject(agent.prompter.prompts.npc);
        this.temp_goals = [];
        this.item_goal = new ItemGoal(agent, this.data);
        this.build_goal = new BuildGoal(agent);
        this.constructions = {};
    }

    getBuiltPositions() {
        let positions = [];
        for (let name in this.data.built) {
            let position = this.data.built[name].position;
            let offset = this.constructions[name].offset;
            let sizex = this.constructions[name].blocks[0][0].length;
            let sizez = this.constructions[name].blocks[0].length;
            let sizey = this.constructions[name].blocks.length;
            for (let y = offset; y < sizey+offset; y++) {
                for (let z = 0; z < sizez; z++) {
                    for (let x = 0; x < sizex; x++) {
                        positions.push({x: position.x + x, y: position.y + y, z: position.z + z});
                    }
                }
            }
        }
        return positions;
    }

    init() {
        if (this.data === null) return;

        for (let file of readdirSync('src/agent/npc/construction')) {
            if (file.endsWith('.json')) {
                try {
                    this.constructions[file.slice(0, -5)] = JSON.parse(readFileSync('src/agent/npc/construction/' + file, 'utf8'));
                } catch (e) {
                    console.log('Error reading construction file: ', file);
                }
            }
        }

        this.agent.bot.on('idle', async () => {
            // Wait a while for inputs before acting independently
            await new Promise((resolve) => setTimeout(resolve, 2000));
            if (!this.agent.isIdle()) return;

            // Persue goal
            if (!this.agent.coder.resume_func)
                this.executeNext();
        });
    }

    async executeNext() {
        // If we need more blocks to complete a building, get those first
        let goals = this.temp_goals.concat(this.data.goals);

        for (let goal of goals) {

            // Obtain goal item or block
            if (this.constructions[goal.name] === undefined) {
                if (!itemSatisfied(this.agent.bot, goal.name, goal.quantity)) {
                    await this.item_goal.executeNext(goal.name, goal.quantity);
                    break;
                }
            }

            // Build construction goal
            else {
                let res = null;
                if (this.data.built.hasOwnProperty(goal.name)) {
                    res = await this.build_goal.executeNext(
                        this.constructions[goal.name],
                        this.data.built[goal.name].position,
                        this.data.built[goal.name].orientation
                    );
                } else {
                    res = await this.build_goal.executeNext(this.constructions[goal.name]);
                    this.data.built[goal.name] = {
                        name: goal.name,
                        position: res.position,
                        orientation: res.orientation
                    };
                }
                this.temp_goals = [];
                for (let block_name in res.missing) {
                    this.temp_goals.push({
                        name: block_name,
                        quantity: res.missing[block_name]
                    })
                }
                if (res.acted) break;
            }
        }

        if (this.agent.isIdle())
            this.agent.bot.emit('idle');
    }
}