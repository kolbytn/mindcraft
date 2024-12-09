import yaml from 'js-yaml'
import { readFileSync } from 'fs';

export function loadTask(taskId) {
    try {
        const taskType = taskId.split('_')[0];
        const tasksFile = readFileSync(`tasks/${taskType}_tasks.yaml`, 'utf8');
        const tasks = yaml.load(tasksFile);
        const task = tasks[taskId];
        if (!task) {
            throw new Error(`Task ${taskId} not found`);
        }
        
        return task;
    } catch (error) {
        console.error('Error loading task:', error);
        process.exit(1);
    }
}

export class TechTreeHarvestValidator {
    constructor(task, bot) {
        this.target = task.target;
        this.number_of_target = task.number_of_target;
        this.bot = bot;
    }

    validate() {
        try{
            console.log("validate");
            let valid = false;
            let total_targets = 0;
            this.bot.inventory.slots.forEach((slot) => {
                if (slot && slot.name.toLowerCase() === this.target) {
                    total_targets += slot.count;
                }
                if (slot && slot.name.toLowerCase() === this.target && slot.count >= this.number_of_target) {
                    valid = true;
                    console.log('Task is complete');
                }
            });
            if (total_targets >= this.number_of_target) {
                valid = true;
                console.log('Task is complete');
            }
            return valid;
        } catch (error) {
            console.error('Error validating task:', error);
            return false;
        }
    }
}
