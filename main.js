import { AgentProcess } from './src/process/agent-process.js';
import settings from './settings.js';
import yargs from 'yargs';
import { loadTask } from './src/utils/tasks.js';
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


function main() {
    const args = parseArguments();

    if (args.task) {
        var task = loadTask(args.task);
        // Inject task information into process.env for the agent to access
        process.env.MINECRAFT_TASK_GOAL = task.goal;
        process.env.MINECRAFT_TASK_INVENTORY = JSON.stringify(task.initial_inventory || {});
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
        agent.start(profiles[i], load_memory, init_message, i, args.task);
    }
}

try {
    main();
} catch (error) {
    console.error('An error occurred:', error);
    process.exit(1);
}