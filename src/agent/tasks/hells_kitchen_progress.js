import { existsSync, readFileSync, writeFileSync } from 'fs';

const PROGRESS_FILE = './hells_kitchen_progress.json';

export const hellsKitchenProgressManager = {
    readProgress() {
        try {
            if (existsSync(PROGRESS_FILE)) {
                const data = readFileSync(PROGRESS_FILE, 'utf8');
                return JSON.parse(data);
            }
        } catch (err) {
            console.error('Error reading progress file:', err);
        }
        return { taskId: null, agent0Complete: false, agent1Complete: false };
    },

    writeProgress(progress) {
        try {
            writeFileSync(PROGRESS_FILE, JSON.stringify(progress), 'utf8');
        } catch (err) {
            console.error('Error writing progress file:', err);
        }
    },

    resetTask(taskId) {
        const progress = { taskId, agent0Complete: false, agent1Complete: false };
        this.writeProgress(progress);
        return progress;
    },

    updateAgentProgress(taskId, agentId, isComplete) {
        const progress = this.readProgress();

        if (progress.taskId !== taskId) {
            progress.taskId = taskId;
            progress.agent0Complete = false;
            progress.agent1Complete = false;
        }

        if (agentId === 0) progress.agent0Complete = isComplete;
        if (agentId === 1) progress.agent1Complete = isComplete;

        this.writeProgress(progress);
        return progress;
    },

    isTaskComplete(taskId) {
        const progress = this.readProgress();
        if (progress.taskId !== taskId) return false;
        return progress.agent0Complete && progress.agent1Complete;
    }
};
