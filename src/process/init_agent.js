import { Agent } from '../agent/agent.js';
import { serverProxy } from '../agent/mindserver_proxy.js';
import yargs from 'yargs';
import { readFileSync } from 'fs';

// RC27: Catch unhandled errors from Baritone executor and other async code
// that crash the process. Log them and continue instead of exiting.
process.on('uncaughtException', (err) => {
    // Known: Baritone executor.js path becomes undefined mid-navigation
    if (err?.message?.includes('Cannot read properties of undefined')) {
        console.error(`[RC27] Caught non-fatal uncaught error: ${err.message}`);
        return; // swallow — goToGoal's timeout will handle recovery
    }
    console.error('[RC27] Uncaught exception (fatal):', err);
    process.exit(1);
});
process.on('unhandledRejection', (reason) => {
    // Known: Baritone promise rejections when path is null
    const msg = reason?.message || String(reason);
    if (msg.includes('Cannot read properties of undefined')) {
        console.error(`[RC27] Caught non-fatal unhandled rejection: ${msg}`);
        return;
    }
    console.error('[RC27] Unhandled rejection:', reason);
});

const args = process.argv.slice(2);
if (args.length < 1) {
    console.log('Usage: node init_agent.js -n <agent_name> -p <port> -l <load_memory> -m <init_message> -c <count_id>');
    process.exit(1);
}

const argv = yargs(args)
    .option('name', {
        alias: 'n',
        type: 'string',
        description: 'name of agent'
    })
    .option('load_memory', {
        alias: 'l',
        type: 'boolean',
        description: 'load agent memory from file on startup'
    })
    .option('init_message', {
        alias: 'm',
        type: 'string',
        description: 'automatically prompt the agent on startup'
    })
    .option('count_id', {
        alias: 'c',
        type: 'number',
        default: 0,
        description: 'identifying count for multi-agent scenarios',
    })
    .option('port', {
        alias: 'p',
        type: 'number',
        description: 'port of mindserver'
    })
    .option('url', {
        alias: 'u',
        type: 'string',
        description: 'remote mindserver URL (e.g. http://host:8080)'
    })
    .option('settings_file', {
        alias: 's',
        type: 'string',
        description: 'path to settings JSON file (required for remote mode)'
    })
    .argv;

await (async () => {
    try {
        if (argv.url && argv.settings_file) {
            console.log(`Connecting to remote MindServer at ${argv.url}`);
            const remoteSettings = JSON.parse(readFileSync(argv.settings_file, 'utf8'));
            await serverProxy.connect(argv.name, argv.url, remoteSettings);
        } else {
            console.log('Connecting to MindServer');
            await serverProxy.connect(argv.name, argv.port);
        }
        console.log('Starting agent');
        const agent = new Agent();
        serverProxy.setAgent(agent);
        await agent.start(argv.load_memory, argv.init_message, argv.count_id);
    } catch (error) {
        console.error('Failed to start agent process:');
        console.error(error.message);
        console.error(error.stack);
        process.exit(1);
    }
})();
