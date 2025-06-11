import * as Mindcraft from '../mindcraft/mindcraft.js';
import settings from '../../settings.js';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

function parseArguments() {
    return yargs(hideBin(process.argv))
        .option('mindserver_host', {
            type: 'string',
            describe: 'Mindserver host',
            default: settings.mindserver_host
        })
        .option('mindserver_port', {
            type: 'number',
            describe: 'Mindserver port',
            default: settings.mindserver_port
        })
        .help()
        .alias('help', 'h')
        .parse();
}

const args = parseArguments();

settings.mindserver_host = args.mindserver_host;
settings.mindserver_port = args.mindserver_port;

Mindcraft.init(settings.mindserver_host, settings.mindserver_port);

console.log(`Mindcraft initialized with MindServer at ${settings.mindserver_host}:${settings.mindserver_port}`); 