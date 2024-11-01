import { AgentProcess } from './src/process/agent-process.js';
import settings from './settings.js';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { readFileSync } from 'fs';

function parseArguments() {
    return yargs(hideBin(process.argv))
        .option('profiles', {
            type: 'array',
            describe: 'List of agent profile paths',
        })
        .option('task', {
            type: 'string',
            describe: 'path for agent path specification',
        })
        .help()
        .alias('help', 'h')
        .parse();
}

function getProfiles(args) {
    return args.profiles || settings.profiles;
}

function main() {
    const args = parseArguments();
    const profiles = getProfiles(args);
    let task_specification = `${args.task}/task.json`
    const task = JSON.parse(readFileSync(task_specification, 'utf8'));
    var goal = task.goal;
    console.log(profiles);
    const { load_memory, init_message } = settings;
    // if (goal !== "") {
    //     console.log('Goal:', goal);
    //     var goal = goal;
    // }
    // else {
    //     console.log('No goal specified');
    //     var goal = init_message;
    // }
    if (goal === "") {
        console.log('No goal specified');
        var goal = init_message;
    }

    for (let i=0; i<profiles.length; i++) {
        const agent = new AgentProcess();
        let agent_task_path = `${args.task}/agents/agent_${i}.json`;
        // todo: edit agent code so that we can give them starting stuff :D 
        agent.start(profiles[i], 
            load_memory, 
            goal, 
            i, 
            agent_task_path, 
            task_specification);
    }

}

try {
    main();
} catch (error) {
    console.error('An error occurred:', error);
    process.exit(1);
}