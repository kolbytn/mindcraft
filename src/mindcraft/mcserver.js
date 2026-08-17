import net from 'net';
import mc from 'minecraft-protocol';

/**
 * Pings a Minecraft server and returns its advertised metadata.
 * @param {string} ip - The IP address to scan.
 * @param {number} port - The port to check.
 * @param {number} timeout - The connection timeout in ms.
 * @param {boolean} verbose - Whether to print output on connection errors.
 * @returns {Promise<Object|null>}
 */
export async function serverInfo(ip, port, timeout = 1000, verbose = false) {
    return new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutId);
            resolve(value);
        };

        const timeoutId = setTimeout(() => {
            if (verbose)
                console.error(`Timeout pinging server ${ip}:${port}`);
            finish(null);
        }, timeout);

        mc.ping({
            host: ip,
            port
        }, (err, response) => {
            if (err) {
                if (verbose)
                    console.error(`Error pinging server ${ip}:${port}`, err);
                return finish(null);
            }

            // extract version number from modded servers like "Paper 1.21.4"
            const version = response?.version?.name || '';
            const match = String(version).match(/\d+\.\d+(?:\.\d+)?/);
            const numericVersion = match ? match[0] : null;
            if (verbose && numericVersion !== version) {
                console.log(`Modded server found (${version}), attempting to use ${numericVersion}...`);
            }

            const description = response?.description;
            const name = typeof description === 'string'
                ? description
                : description?.text || 'No description provided.';

            finish({
                host: ip,
                port,
                name,
                ping: response?.latency,
                version: numericVersion
            });
        });
    });
}

function checkPort(ip, port, timeout) {
    return new Promise((resolve) => {
        const socket = net.createConnection({ host: ip, port, timeout });
        let settled = false;

        const finish = (value) => {
            if (settled) return;
            settled = true;
            socket.destroy();
            resolve(value);
        };

        socket.once('connect', () => finish(port));
        socket.once('error', () => finish(null));
        socket.once('timeout', () => finish(null));
    });
}

/**
 * Scans the normal Minecraft LAN port range using bounded concurrency.
 * @param {string} ip - The IP address to scan.
 * @param {boolean} earlyExit - Whether to stop once a server is found.
 * @param {number} timeout - Per-port TCP timeout in ms.
 * @returns {Promise<Array>}
 */
export async function findServers(ip, earlyExit = false, timeout = 100) {
    const servers = [];
    const startPort = 49000;
    const endPort = 65000;
    const concurrency = 64;
    let nextPort = startPort;
    let stop = false;

    async function worker() {
        while (!stop) {
            const port = nextPort++;
            if (port > endPort) return;

            const openPort = await checkPort(ip, port, timeout);
            if (!openPort || stop) continue;

            const server = await serverInfo(ip, openPort, 200, false);
            if (!server || stop) continue;

            servers.push(server);
            if (earlyExit) {
                stop = true;
                return;
            }
        }
    }

    const workerCount = Math.min(concurrency, endPort - startPort + 1);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    servers.sort((a, b) => a.port - b.port);

    return earlyExit ? servers.slice(0, 1) : servers;
}

/**
 * Gets the MC server info from the host and port.
 * @param {string} host - The host to search for.
 * @param {number} port - The port to search for.
 * @param {string} version - The version to search for.
 * @returns {Promise<Object>} - A Promise that resolves to the server info object.
 */
export async function getServer(host, port, version) {
    let server = null;
    let serverString = '';
    let serverVersion = '';

    // Search for server
    if (port == -1) {
        console.log(`No port provided. Searching for LAN server on host ${host}...`);
        const servers = await findServers(host, true);
        if (servers.length > 0)
            server = servers[0];

        if (server == null)
            throw new Error('No server found on LAN.');
    }
    else {
        server = await serverInfo(host, port, 1000, true);
    }

    // Server not found
    if (server == null)
        throw new Error(`MC server not found. (Host: ${host}, Port: ${port}) Check the host and port in settings.js, and ensure the server is running and open to public or LAN.`);

    serverString = `(Host: ${server.host}, Port: ${server.port}, Version: ${server.version})`;

    if (version === 'auto')
        serverVersion = server.version;
    else
        serverVersion = version;

    if (!serverVersion) {
        throw new Error(`MC server was found ${serverString}, but its Minecraft version could not be determined.`);
    }

    // Server version unsupported / mismatch
    const isSupported = mc.supportedVersions.some(v =>
        serverVersion === v || (serverVersion.startsWith(v) && serverVersion.charAt(v.length) === '.')
    ); // Checks version or parent version (e.g. if 1.7 is supported then 1.7.2 will be allowed)

    if (!isSupported)
        throw new Error(`MC server was found ${serverString}, but version is unsupported. Supported versions are: ${mc.supportedVersions.join(', ')}.`);
    else if (version !== 'auto' && server.version !== version)
        throw new Error(`MC server was found ${serverString}, but version is incorrect. Expected ${version}, but found ${server.version}. Check the server version in settings.js.`);
    else
        console.log(`MC server found. ${serverString}`);

    return server;
}
