import { AgentProcess } from './src/process/agent-process.js';
import settings from './settings.js';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { serverInfo, findServers } from './src/utils/mcserver.js';
import mc from 'minecraft-protocol';

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
    return args.profiles || settings.profiles;
}

async function getServer() {
    let server = null;
    let serverString = "";
    let serverVersion = "";

    // Search for server
    if (settings.port == -1)
    {
        console.log("No port provided. Searching for LAN server...");

        await findServers(settings.host, true).then((servers) => {
            if (servers.length > 0)
                server = servers[0];
        });

        if (server == null)
            throw new Error(`No server found on LAN.`);
    }
    else
        server = await serverInfo(settings.host, settings.port);

    // Server not found
    if (server == null) 
        throw new Error(`Server not found. (Host: ${settings.host}, Port: ${settings.port}) Check the host and port in settings.js.`);

    serverString = `(Host: ${server.host}, Port: ${server.port}, Version: ${server.version})`;

    if (settings.minecraft_version === "auto")
        serverVersion = server.version;
    else
        serverVersion = settings.minecraft_version;
    
    // Server version unsupported / mismatch
    if (mc.supportedVersions.indexOf(serverVersion) === -1)
        throw new Error(`A server was found ${serverString}, but version is unsupported. Supported versions are: ${mc.supportedVersions.join(", ")}.`);
    else if (settings.minecraft_version !== "auto" && server.version !== settings.minecraft_version)
        throw new Error(`A server was found ${serverString}, but version is incorrect. Expected ${settings.minecraft_version}, but found ${server.version}.`);
    else
        console.log(`Server found. ${serverString}`);

    return server;
}

async function main() {
    const args = parseArguments();
    const profiles = getProfiles(args);
    console.log(profiles);
    const { load_memory, init_message } = settings;

    // Get server
    const server = await getServer();

    for (let i=0; i<profiles.length; i++) {
        const agent = new AgentProcess();
        agent.start(profiles[i], load_memory, init_message, i);
    }
}

try {
    main();
} catch (error) {
    console.error('An error occurred:', error);
    process.exit(1);
}