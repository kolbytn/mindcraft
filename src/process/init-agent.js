import { Agent } from '../agent/agent.js';
import yargs from 'yargs';

const args = process.argv.slice(2);
if (args.length < 1) {
    console.log('Usage: node init_agent.js <agent_name> [-c] [-a]');
    process.exit(1);
}

const argv = yargs(args)
    .option('profile', {
        alias: 'p',
        type: 'string',
        description: 'profile to use for agent'
    })
    .option('clear_memory', {
        alias: 'c',
        type: 'boolean',
        description: 'restart memory from scratch'
    })
    .option('autostart', {
        alias: 'a',
        type: 'boolean',
        description: 'automatically prompt the agent on startup'
    }).argv

const name = argv._[0];
const save_path = `./bots/${name}/memories.json`;
const load_path = !!argv.clear_memory ? `./bots/${name}/${argv.profile}.json` : save_path;
const init_message = !!argv.autostart ? 'Agent process restarted. Notify the user and decide what to do.' : null;

new Agent(name, save_path, load_path, init_message);
