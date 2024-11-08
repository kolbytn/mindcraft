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