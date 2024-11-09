import { AgentProcess } from './src/process/agent-process.js';
import settings from './settings.js';
import yargs from 'yargs';
import { loadTask } from './src/utils/tasks.js';
import { hideBin } from 'yargs/helpers';
import { readFileSync, writeFileSync } from 'fs';


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

//todo: modify for multiple agents
function getProfiles(args) {
    if (args.task) {
        // todo: make temporary json profiles for the multiple agents
        var task = loadTask(args.task);
        if ('agent_number' in task && task.agent_number > 1) {
            var profile = JSON.parse(readFileSync('./task_andy.json', 'utf8'));
            var agent_names = task.agent_names;
            var filenames = [];
            for (let i=0; i<task.agent_number; i++) {
                let temp_profile = profile;
                temp_profile.name = agent_names[i];
                //todo: contraints 
                var filename = `profiles/task_${agent_names[i]}.json`;
                writeFileSync(filename, JSON.stringify(temp_profile, null, 2));
                filenames.push(filename);
            }
            return filenames;
        }
    } else if (args.task) {
        return ['./task_andy.json'];
    }
    //todo: return two or more profiles if multi-agent
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
    // todo: do inventory
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