import { Agent } from '../agent/agent.js';
import yargs from 'yargs';

const args = process.argv.slice(2);
if (args.length < 1) {
    console.log('Usage: node init_agent.js <agent_name> [profile] [init_message]');
    process.exit(1);
}

const argv = yargs(args)
    .option('profile', {
        alias: 'p',
        type: 'string',
        description: 'profile to use for agent'
    })
    .option('init_message', {
        alias: 'm',
        type: 'string',
        description: 'automatically prompt the agent on startup'
    }).argv

const name = args[0];
new Agent(name, argv.profile, argv.init_message);
