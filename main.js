import { AgentProcess } from './src/process/agent-process.js';
import settings from './settings.js';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

function parseArguments() {
    return yargs(hideBin(process.argv))
        .option('profiles', {
            type: 'array',
            describe: 'List of agent profile paths',
        })
        .help()
        .alias('help', 'h')
        .parse();
}

function getProfiles(args) {
    return args.agents || settings.profiles;
}

function main() {
    const args = parseArguments();
    const profiles = getProfiles(args);
    const { load_memory, init_message } = settings;

    for (const profile of profiles) {
        const agent = new AgentProcess();
        agent.start(profile, load_memory, init_message);
    }
}

try {
    main();
} catch (error) {
    console.error('An error occurred:', error);
    process.exit(1);
}