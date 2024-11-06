import { AgentProcess } from './src/process/agent-process.js';
import settings from './settings.js';
import yargs from 'yargs';
import yaml from 'js-yaml'
import { readFileSync } from 'fs';
import { hideBin } from 'yargs/helpers';


function parseArguments() {
    return yargs(hideBin(process.argv))
        .option('profiles', {
            type: 'array',
            describe: 'List of agent profile paths',
        })
        .option('task', {
            type: 'string',
            describe: 'Task ID to execute'
        })
        .help()
        .alias('help', 'h')
        .parse();
}

function getProfiles(args) {
    if (args.task) {
        return ['./task_andy.json'];
    }


    return args.profiles || settings.profiles;
}

function loadTask(taskId) {
    try {

        const taskType = taskId.split('_')[0];
        const tasksFile = readFileSync(`tasks/${taskType}_tasks.yaml`, 'utf8');
        const tasks = yaml.load(tasksFile);
        console.log(tasks)
        const task = tasks[taskId];
        if (!task) {
            throw new Error(`Task ${taskId} not found`);
        }
        
        // Inject task information into process.env for the agent to access
        process.env.MINECRAFT_TASK_GOAL = task.goal;
        process.env.MINECRAFT_TASK_INVENTORY = JSON.stringify(task.initial_inventory || {});
        
        return task;
    } catch (error) {
        console.error('Error loading task:', error);
        process.exit(1);
    }
}

function main() {
    const args = parseArguments();

    if (args.task) {
        loadTask(args.task);
    }
    const profiles = getProfiles(args);
    console.log(profiles);
    // var { load_memory, init_message } = settings;
    var load_memory = settings.load_memory;
    var init_message = settings.init_message

    if (args.task) {
        init_message = "Announce your task to everyone and get started with it immediately, if cheats are enabled then feel free to use newAction commands, no need to collect or mine or gather any items"
    }

    for (let i=0; i<profiles.length; i++) {
        const agent = new AgentProcess();
        agent.start(profiles[i], load_memory, init_message, i);
    }
}

try {
    main();
} catch (error) {
    console.error('An error occurred:', error);
    process.exit(1);
}