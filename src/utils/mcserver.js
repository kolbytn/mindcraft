import settings from '../../settings.js';
import net from 'net';
import mc from 'minecraft-protocol';

/**
 * Scans the IP address for Minecraft LAN servers and collects their info.
 * @param {string} ip - The IP address to scan.
 * @param {number} port - The port to check.
 * @param {number} timeout - The connection timeout in ms.
 * @returns {Promise<Array>} - A Promise that resolves to an array of server info objects.
 */
export async function serverInfo(ip, port, timeout = 100) {
    return new Promise((resolve) => {

        setTimeout(() => {
            resolve(null); // Resolve as null if no response within timeout
        }, timeout);

        mc.ping({
            host: ip,
            port
        }, (err, response) => {
            if (err) return resolve(null);

            const serverInfo = {
                host: ip,
                port,
                name: response.description.text || 'No description provided.',
                ping: response.latency,
                version: response.version.name
            };

            resolve(serverInfo);
        });
    });
}

/**
 * Scans the IP address for Minecraft LAN servers and collects their info.
 * @param {string} ip - The IP address to scan.
 * @param {boolean} earlyExit - Whether to exit early after finding a server.
 * @param {number} timeout - The connection timeout in ms.
 * @returns {Promise<Array>} - A Promise that resolves to an array of server info objects.
 */
export async function findServers(ip, earlyExit = false, timeout = 100) {
    const servers = [];
    const startPort = 49000;
    const endPort = 65000;

    const checkPort = (port) => {
        return new Promise((resolve) => {
            const socket = net.createConnection({ host: ip, port, timeout }, () => {
                socket.end();
                resolve(port); // Port is open
            });

            socket.on('error', () => resolve(null)); // Port is closed
            socket.on('timeout', () => {
                socket.destroy();
                resolve(null);
            });
        });
    };

    // Surpress console output
    const originalConsoleLog = console.log;
    console.log = () => { };
    
    for (let port = startPort; port <= endPort; port++) {
        const openPort = await checkPort(port);
        if (openPort) {
            const server = await serverInfo(ip, port);
            if (server) {
                servers.push(server);

                if (earlyExit) break;
            }
        }
    }

    // Restore console output
    console.log = originalConsoleLog;

    return servers;
}

export async function getServer() {
    let server = null;
    let serverString = "";
    let serverVersion = "";
    
    // Search for server
    if (settings.port == -1)
    {
        console.log(`No port provided. Searching for LAN server on host ${settings.host}...`);
        
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