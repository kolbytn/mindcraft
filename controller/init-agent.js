import { Agent } from '../agent.js';
import yargs from 'yargs';

const args = process.argv.slice(2);
if (args.length < 1) {
    console.log('Usage: node init_agent.js <agent_name> [-c] [-a]');
    process.exit(1);
}

const argv = yargs(args)
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
const clear_memory = !!argv.clear_memory;
const autostart = !!argv.autostart;
const save_path = './bots/'+name+'.json';

new Agent(name, save_path, clear_memory, autostart);
