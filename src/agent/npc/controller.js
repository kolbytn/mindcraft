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
        this.item_goal = new ItemGoal(agent);
        this.build_goal = new BuildGoal(agent);
        this.constructions = {};
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
        let goals = this.data.goals;
        if (this.temp_goals !== null && this.temp_goals.length > 0) {
            goals = this.temp_goals.concat(goals);
        }

        for (let goal of goals) {
            if (this.constructions[goal] === undefined && !itemSatisfied(this.agent.bot, goal)) {
                await this.item_goal.executeNext(goal);
                break;
            } else if (this.constructions[goal]) {
                let res = null;
                if (this.data.built.hasOwnProperty(goal)) {
                    res = await this.build_goal.executeNext(
                        this.constructions[goal],
                        this.data.built[goal].position,
                        this.data.built[goal].orientation
                    );
                } else {
                    res = await this.build_goal.executeNext(this.constructions[goal]);
                    this.data.built[goal] = {
                        name: goal,
                        position: res.position,
                        orientation: res.orientation
                    };
                }
                this.temp_goals = res.missing;
                if (res.acted) break;
            }
        }
    }
}