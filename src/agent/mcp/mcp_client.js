/**
 * MCP Client Implementation
 * Handles server settings, connections and tool calls based on Model Context Protocol
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from 'fs/promises';
import path from 'path';
import process from 'process';
import { ToolService } from './tool_service.js';
import settings from '../../../settings.js';

/**
 * MCP Client Class
 */
export class MCPClient {
    constructor(agent) {
        this.agent = agent;
        this.connections = new Map(); // Maps serverIdentifier to connection information
        this.tools = [];
        this.configPath = settings.mcp_settings || path.join(process.cwd(), 'mcp_settings.json');
    }

    /**
     * Initialize MCP client and connect to servers
     */
    async init() {
        if (!settings.mcp_servers) return false;
        return await this.autoConnect();
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
                console.log("[mcp_client.js][autoConnect] No MCP servers defined in config");
                return false;
            }

            console.log(`[mcp_client.js][autoConnect] Found ${serverIds.length} MCP servers, connecting in parallel...`);
            
            // Connect to all servers in parallel
            const connectionPromises = serverIds.map(id => this.connectToServer(id, config));
            const results = await Promise.allSettled(connectionPromises);
            
            const successCount = results.filter(r => r.status === 'fulfilled' && r.value).length;
            console.log(`[mcp_client.js][autoConnect] Connected to ${successCount}/${serverIds.length} MCP servers`);
            
            return successCount > 0;
        } catch (error) {
            console.error(`[mcp_client.js][autoConnect] Failed: ${error.message}\nStack: ${error.stack}`);
            return false;
        }
    }

    /**
     * Read MCP configuration from file
     */
    async readConfig() {
        try {
            await fs.access(this.configPath);
            const content = await fs.readFile(this.configPath, "utf8");
            const config = JSON.parse(content);
            console.log(`[mcp_client.js][readConfig] Read MCP config successfully`);
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
     * Connect to MCP server
     */
    async connectToServer(serverIdentifier, config = null) {
        console.log(`[mcp_client.js][connectToServer] Connecting to server: ${serverIdentifier}`);
        
        // Check if already connected
        if (this.isServerConnected(serverIdentifier)) {
            console.log(`[mcp_client.js][connectToServer] Already connected to server: ${serverIdentifier}`);
            return true;
        }
        
        try {
            // Get configuration if not provided
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
            await this.fetchServerTools(serverIdentifier, connection.toolService, config);
            
            return true;
        } catch (error) {
            console.error(`[mcp_client.js][connectToServer] Connection to ${serverIdentifier} failed: ${error.message}\nStack: ${error.stack}`);
            return false;
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
            const toolService = new ToolService(mcp);
            
            // Connect to server
            await mcp.connect(transport);
            // Wait for server to initialize
            await new Promise(resolve => setTimeout(resolve, 1000));
            console.log(`[mcp_client.js][createConnection] Connected to server: ${serverIdentifier}`);
            
            return {
                mcp,
                transport,
                toolService,
                connected: true
            };
        } catch (error) {
            console.error(`[mcp_client.js][createConnection] Connection failed for ${serverIdentifier}: ${error.message}\nStack: ${error.stack}`);
            return null;
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
                
                console.log(`[mcp_client.js][getTransportOptions] Starting server from config: ${serverIdentifier}, cmd: ${serverConfig.command}`);
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
                
                console.log(`[mcp_client.js][getTransportOptions] Using default server: ${defaultServerName}`);
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
                
                console.log(`[mcp_client.js][getTransportOptions] Starting server from script: ${serverIdentifier} with command: ${command}`);
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
    async fetchServerTools(serverIdentifier, toolService, config) {
        console.log(`[mcp_client.js][fetchServerTools] Getting tools from ${serverIdentifier}...`);
        
        // Retry logic for getting tools
        const maxRetries = 3;
        let serverTools = [];
        
        for (let retryCount = 0; retryCount < maxRetries; retryCount++) {
            try {
                serverTools = await toolService.getTools();
                console.log(`[mcp_client.js][fetchServerTools] Got ${serverTools.length} tools from ${serverIdentifier}`);
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
        
        // Process and store tools
        if (serverTools.length === 0) {
            console.warn(`[mcp_client.js][fetchServerTools] Warning: Server ${serverIdentifier} provided no tools`);
            return;
        }
        
        // Add server identifier to tools and merge with existing tools
        this.tools = [
            ...this.tools,
            ...serverTools.map(tool => ({ ...tool, serverIdentifier }))
        ];
        
        // Log tool names
        console.log(`[mcp_client.js][fetchServerTools] - ${serverIdentifier}\n      - ${serverTools.map(t => t.name).join('\n      - ')}`);
        
        // Set auto approve if configured
        if (config?.mcpServers?.[serverIdentifier]?.autoApprove) {
            const autoApproveList = config.mcpServers[serverIdentifier].autoApprove || [];
            toolService.setAutoApproveList(autoApproveList, true);
            console.log(`[mcp_client.js][fetchServerTools] Auto-approving tools from ${serverIdentifier}`);
        }
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
            return await connection.toolService.callTool(toolName, toolArgs);
        } catch (error) {
            console.error(`[mcp_client.js][callToolFromServer] Call failed for '${toolName}' from '${serverIdentifier}': ${error.message}\nArgs: ${JSON.stringify(toolArgs)}\nStack: ${error.stack}`);
            throw error;
        }
    }

    /**
     * Get available tools
     */
    getTools() {
        return this.tools;
    }

    /**
     * Check if connected to server
     */
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

    /**
     * Clean up resources
     */
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
        
        // Wait for all disconnect operations to complete
        if (disconnectPromises.length > 0) {
            await Promise.allSettled(disconnectPromises);
        }
        
        this.tools = [];
        this.connections.clear();
    }

    /**
     * Get formatted tool information
     */
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
        
        // Format output
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