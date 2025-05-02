import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from 'fs/promises';
import path from 'path';
import process from 'process';
import settings from '../../../settings.js';

export class MCPClient {
    constructor(agent) {
        this.agent = agent;
        this.connections = new Map(); // Maps serverIdentifier to connection information
        this.tools = [];
        this.configPath = settings.mcp_settings || path.join(process.cwd(), 'mcp_settings.json');
    }

    async init() {
        if (!settings.mcp_servers) return false;
        return await this.autoConnect();
    }

    /**
     * Read MCP configuration from file
     */
    async readConfig() {
        try {
            await fs.access(this.configPath);
            const content = await fs.readFile(this.configPath, "utf8");
            const config = JSON.parse(content);
            return config;
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.error(`[mcp_client.js][readConfig] Config not found: ${this.configPath}`);
            } else if (error instanceof SyntaxError) {
                console.error(`[mcp_client.js][readConfig] Failed to parse config: ${error.message}\nFile: ${this.configPath}`);
            } else {
                console.error(`[mcp_client.js][readConfig] Error: ${error.message}\nStack: ${error.stack}`);
            }
            return null;
        }
    }

    /**
     * Create and initialize MCP client connection
     */
    async createConnection(serverIdentifier, transportOptions) {
        try {
            const mcp = new Client({
                name: `mindcraft-mcp-client-${serverIdentifier}`,
                version: "1.0.0",
            });

            const transport = new StdioClientTransport(transportOptions);

            await mcp.connect(transport);
            await new Promise(resolve => setTimeout(resolve, 1000));

            return {
                mcp,
                transport,
                connected: true
            };
        } catch (error) {
            console.error(`[mcp_client.js][createConnection] Connection failed for ${serverIdentifier}: ${error.message}\nStack: ${error.stack}`);
            return null;
        }
    }

    /**
     * Connect to MCP server
     */
    async connectToServer(serverIdentifier, config = null) {
        if (this.isServerConnected(serverIdentifier)) {
            return true;
        }
        try {
            if (!config) {
                config = await this.readConfig();
                if (!config) return false;
            }

            // Get transport options
            const transportOptions = this.getTransportOptions(serverIdentifier, config);
            if (!transportOptions) return false;

            // Create and connect client
            const connection = await this.createConnection(serverIdentifier, transportOptions);
            if (!connection) return false;

            // Store connection
            this.connections.set(serverIdentifier, connection);

            // Get tools from server
            await this.fetchServerTools(serverIdentifier, connection.mcp, config);

            return true;
        } catch (error) {
            console.error(`[mcp_client.js][connectToServer] Connection to ${serverIdentifier} failed: ${error.message}\nStack: ${error.stack}`);
            return false;
        }
    }

    /**
     * Connect to all configured servers in parallel
     */
    async autoConnect() {
        try {
            const config = await this.readConfig();
            if (!config) return false;

            const serverIds = Object.keys(config.mcpServers || {});
            if (serverIds.length === 0) {
                return false;
            }

            const connectionPromises = serverIds.map(id => this.connectToServer(id, config));
            const results = await Promise.allSettled(connectionPromises);
            
            const successCount = results.filter(r => r.status === 'fulfilled' && r.value).length;
            
            return successCount > 0;
        } catch (error) {
            console.error(`[mcp_client.js][autoConnect] Failed: ${error.message}\nStack: ${error.stack}`);
            return false;
        }
    }

    
    /**
     * Get transport options based on server configuration or script path
     */
    getTransportOptions(serverIdentifier, config) {
        try {
            // Check if server is in config
            if (config?.mcpServers?.[serverIdentifier]) {
                const serverConfig = config.mcpServers[serverIdentifier];
                if (!serverConfig.command) {
                    throw new Error(`Server ${serverIdentifier} missing command field`);
                }

                return {
                    command: serverConfig.command,
                    args: serverConfig.args || [],
                    env: serverConfig.env,
                };
            }
            
            // Check for default server
            if (serverIdentifier === "default" && config?.defaultServer && config?.mcpServers?.[config.defaultServer]) {
                const defaultServerName = config.defaultServer;
                const serverConfig = config.mcpServers[defaultServerName];

                return {
                    command: serverConfig.command,
                    args: serverConfig.args || [],
                    env: serverConfig.env,
                };
            }
            
            // Handle as script path
            if (serverIdentifier.includes('/') || serverIdentifier.includes('\\')) {
                const isJs = serverIdentifier.endsWith(".js");
                const isPy = serverIdentifier.endsWith(".py");
                
                if (!isJs && !isPy) {
                    console.warn("[mcp_client.js][getTransportOptions] Warning: Script has no .js/.py extension");
                }
                
                const command = isPy
                    ? process.platform === "win32" ? "python" : "python3" 
                    : process.execPath;

                return {
                    command,
                    args: [serverIdentifier],
                };
            }
            
            throw new Error(`Server ${serverIdentifier} not found in config`);
        } catch (error) {
            console.error(`[mcp_client.js][getTransportOptions] Failed: ${error.message}\nContext: serverIdentifier=${serverIdentifier}`);
            return null;
        }
    }

    /**
     * Fetch tools from server with retry logic
     */
    async fetchServerTools(serverIdentifier, mcp, config) {
        const maxRetries = 3;
        let serverTools = [];
        
        for (let retryCount = 0; retryCount < maxRetries; retryCount++) {
            try {
                const toolsResult = await mcp.listTools();
                if (!toolsResult || !toolsResult.tools) {
                    console.warn(`[mcp_client.js][fetchServerTools] Failed to get tool list, server ${serverIdentifier} did not return tool information`);
                    return [];
                }
                serverTools = toolsResult.tools;
                break;
            } catch (error) {
                if (retryCount >= maxRetries - 1) {
                    console.error(`[mcp_client.js][fetchServerTools] Failed after ${maxRetries} attempts: ${error.message}\nServer: ${serverIdentifier}\nStack: ${error.stack}`);
                    return;
                }
                console.log(`[mcp_client.js][fetchServerTools] Retry ${retryCount + 1}/${maxRetries} getting tools from ${serverIdentifier}...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        if (serverTools.length === 0) {
            console.warn(`[mcp_client.js][fetchServerTools] Warning: Server ${serverIdentifier} provided no tools`);
            return;
        }

        this.tools = [
            ...this.tools,
            ...serverTools.map(tool => ({ ...tool, serverIdentifier }))
        ];
        
        // Log tool names
        console.log(`[mcp_client.js][fetchServerTools] - ${serverIdentifier}\n      - ${serverTools.map(t => t.name).join('\n      - ')}`);

    }

    /**
     * Call MCP tool
     */
    async callTool(toolName, toolArgs) {
        try {
            const tool = this.tools.find(t => t.name === toolName);
            if (!tool) {
                throw new Error(`Tool ${toolName} not found`);
            }
            
            return await this.callToolFromServer(tool.serverIdentifier, toolName, toolArgs);
        } catch (error) {
            console.error(`[mcp_client.js][callTool] Failed for tool '${toolName}': ${error.message}\nStack: ${error.stack}`);
            throw error;
        }
    }

    /**
     * Call tool from specific server
     */
    async callToolFromServer(serverIdentifier, toolName, toolArgs) {
        const connection = this.connections.get(serverIdentifier);
        if (!connection || !connection.connected) {
            throw new Error(`Not connected to server ${serverIdentifier}`);
        }
        
        try {
            const result = await connection.mcp.callTool({
                name: toolName,
                arguments: toolArgs,
            });
            return result;
        } catch (error) {
            console.error(`[mcp_client.js][callToolFromServer] Call failed for '${toolName}' from '${serverIdentifier}': ${error.message}\nArgs: ${JSON.stringify(toolArgs)}\nStack: ${error.stack}`);
            throw error;
        }
    }


    getTools() {
        return this.tools;
    }

    isServerConnected(serverIdentifier) {
        const connection = this.connections.get(serverIdentifier);
        return !!connection?.connected;
    }

    /**
     * Check if connected to any server
     */
    isConnected() {
        return Array.from(this.connections.values()).some(conn => conn.connected);
    }


    async cleanup() {
        const disconnectPromises = [];
        
        for (const [serverIdentifier, connection] of this.connections.entries()) {
            if (connection?.connected) {
                disconnectPromises.push(
                    connection.mcp.disconnect()
                        .then(() => console.log(`[mcp_client.js][cleanup] Disconnected from server ${serverIdentifier}`))
                        .catch(error => console.error(`[mcp_client.js][cleanup] Disconnect failed for ${serverIdentifier}: ${error.message}\nStack: ${error.stack}`))
                );
            }
        }

        if (disconnectPromises.length > 0) {
            await Promise.allSettled(disconnectPromises);
        }
        
        this.tools = [];
        this.connections.clear();
    }


    getMCPToolsInfo() {
        if (this.tools.length === 0) {
            return "### Available Tools\nNo tools available.";
        }

        // Group tools by server
        const toolsByServer = new Map();
        for (const tool of this.tools) {
            if (!toolsByServer.has(tool.serverIdentifier)) {
                toolsByServer.set(tool.serverIdentifier, []);
            }
            toolsByServer.get(tool.serverIdentifier).push(tool);
        }

        let result = "### Available Tools\n";
        for (const [serverName, serverTools] of toolsByServer.entries()) {
            result += `\n## ${serverName} Server\n`;
            
            for (const tool of serverTools) {
                result += `- ${tool.name}: ${tool.description || 'No description'}\n`;
                
                if (tool.inputSchema) {
                    result += `    Input schema:\n    ${JSON.stringify(tool.inputSchema, null, 2).replace(/\n/g, "\n    ")}\n`;
                } else {
                    result += `    Input schema: None\n`;
                }
            }
        }
        
        return result;
    }
} 