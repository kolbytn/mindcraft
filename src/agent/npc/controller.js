import { NPCData } from './data.js';
import { ItemGoal } from './item_goal.js';


export class NPCContoller {
    constructor(agent) {
        this.agent = agent;
        this.data = NPCData.fromObject(agent.prompter.prompts.npc);
        this.item_goal = new ItemGoal(agent);
    }

    init() {
        if (this.data === null) return;
        this.item_goal.setGoals(this.data.goals);

        this.agent.bot.on('idle', async () => {
            // Wait a while for inputs before acting independently
            await new Promise((resolve) => setTimeout(resolve, 2000));
            if (!this.agent.isIdle()) return;

            // Persue goal
            if (this.agent.coder.resume_func === null)
                this.item_goal.executeNext();
        });
    }
}