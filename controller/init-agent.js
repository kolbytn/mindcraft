import { Agent } from '../agent.js';
import yargs from 'yargs';

const args = process.argv.slice(2);
if (args.length < 1) {
    console.log('Usage: node init_agent.js <agent_name> [options]');
    process.exit(1);
}

const argv = yargs(args)
    .option('restart_memory', {
        alias: 'r',
        type: 'boolean',
        description: 'restart memory from scratch'
    }).argv;

const name = argv._[0];
const restart_memory = !!argv.restart_memory;
const save_path = './bots/'+name+'.json';

let agent = new Agent(name, save_path, restart_memory);
agent.start();
