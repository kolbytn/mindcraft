/**
 * MCP Client Implementation
 * 
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
 * Manages server connections and tool invocations
 */
export class MCPClient {
    constructor(agent) {
        this.agent = agent; // Agent instance
        this.connections = new Map(); // Server connections map
        this.tools = []; // Available tools list
        this.configPath = null; // Config file path
        
        // Get config path from settings
        this.configPath = settings.mcp_settings || path.join(process.cwd(), 'mcp_settings.json');
        
        // Auto-connect if enabled
        if (settings.mcp_servers) {
            this.autoConnect();
        }
    }

    /**
     * Connect to all configured servers
     */
    async autoConnect() {
        try {
            // console.log("Connecting to MCP servers...");
            
            // Check config file
            try {
                await fs.access(this.configPath);
                // console.log(`Found MCP config: ${this.configPath}`);
            } catch (error) {
                console.error(`MCP config not found: ${this.configPath}`);
                return;
            }
            
            // Load config
            const configContent = await fs.readFile(this.configPath, "utf8");
            // console.log(`Read MCP config successfully`);
            
            let config;
            try {
                config = JSON.parse(configContent);
                // console.log(`Parsed MCP config successfully`);
            } catch (error) {
                console.error(`Failed to parse MCP config: ${error.message}`);
                return;
            }
            
            // Connect to servers
            if (config.mcpServers && Object.keys(config.mcpServers).length > 0) {
                // console.log(`Found ${Object.keys(config.mcpServers).length} MCP servers`);
                for (const serverIdentifier of Object.keys(config.mcpServers)) {
                    // console.log(`Connecting to MCP server: ${serverIdentifier}`);
                    const success = await this.connectToServer(serverIdentifier);
                    if (success) {
                        // console.log(`Connected to MCP server: ${serverIdentifier}`);
                    } else {
                        console.error(`Failed to connect to MCP server: ${serverIdentifier}`);
                    }
                }
                // console.log(`Connected to ${this.connections.size} servers total`);
            } else {
                console.warn("No MCP servers defined in config");
            }
        } catch (error) {
            console.error("Auto-connect failed:", error);
        }
    }

    /**
     * Get transport options for a script
     * @param {string} scriptPath Script path
     * @returns {Object} Transport options
     */
    getTransportOptionsForScript(scriptPath) {
        // Check extension
        const isJs = scriptPath.endsWith(".js");
        const isPy = scriptPath.endsWith(".py");
        if (!isJs && !isPy) {
            console.warn("Warning: Script has no .js/.py extension, using Node.js");
        }
        
        // Select command
        const command = isPy
            ? process.platform === "win32"
                ? "python"
                : "python3"
            : process.execPath;
            
        return {
            command,
            args: [scriptPath],
        };
    }

    /**
     * Set config path
     * @param {string} filePath Config path
     */
    setConfigPath(filePath) {
        this.configPath = filePath;
    }

    /**
     * Connect to MCP server
     * @param {string} serverIdentifier Server identifier
     * @returns {Promise<boolean>} Success status
     */
    async connectToServer(serverIdentifier) {
        try {
            if (this.connections.has(serverIdentifier) && this.connections.get(serverIdentifier).connected) {
                // console.log(`Already connected to server: ${serverIdentifier}`);
                return true;
            }
            
            // Get transport options
            let transportOptions;
            let config = null;
            
            try {
                // Check config file
                try {
                    await fs.access(this.configPath);
                    // console.log(`Found config: ${this.configPath}`);
                } catch (accessError) {
                    console.error(`Config file ${this.configPath} not found: ${accessError.message}`);
                    throw new Error(`MCP config not found: ${this.configPath}`);
                }
                
                // Read config
                const configContent = await fs.readFile(this.configPath, "utf8");
                try {
                    config = JSON.parse(configContent);
                } catch (parseError) {
                    console.error(`Config JSON parse error: ${parseError.message}`);
                    throw new Error(`MCP config format error`);
                }
                
                // Check server in config
                if (config.mcpServers && config.mcpServers[serverIdentifier]) {
                    const serverConfig = config.mcpServers[serverIdentifier];
                    if (!serverConfig.command) {
                        throw new Error(`Server ${serverIdentifier} missing command field`);
                    }
                    
                    transportOptions = {
                        command: serverConfig.command,
                        args: serverConfig.args || [],
                        env: serverConfig.env,
                    };
                    // console.log(`Starting server from config: ${serverIdentifier}, cmd: ${serverConfig.command}`);
                }
                else if (serverIdentifier === "default" &&
                    config.defaultServer &&
                    config.mcpServers[config.defaultServer]) {
                    // Use default
                    const defaultServerName = config.defaultServer;
                    const serverConfig = config.mcpServers[defaultServerName];
                    transportOptions = {
                        command: serverConfig.command,
                        args: serverConfig.args || [],
                        env: serverConfig.env,
                    };
                    // console.log(`Using default server: ${defaultServerName}`);
                }
                else {
                    // Direct script path
                    if (serverIdentifier.includes('/') || serverIdentifier.includes('\\')) {
                        transportOptions = this.getTransportOptionsForScript(serverIdentifier);
                        // console.log(`Starting server from script: ${serverIdentifier}`);
                    } else {
                        throw new Error(`Server ${serverIdentifier} not found in config`);
                    }
                }
            }
            catch (error) {
                console.error(`Config error: ${error instanceof Error ? error.message : String(error)}`);
                
                // Try as script path
                if (serverIdentifier.includes('/') || serverIdentifier.includes('\\')) {
                    transportOptions = this.getTransportOptionsForScript(serverIdentifier);
                    // console.log(`Trying as script path: ${serverIdentifier}`);
                } else {
                    throw new Error(`Unable to connect to server: ${serverIdentifier}`);
                }
            }
            
            // Create client
            const mcp = new Client({
                name: `mindcraft-mcp-client-${serverIdentifier}`,
                version: "1.0.0",
            });
            
            // console.log(`Creating transport for server: ${serverIdentifier}...`);
            
            // Create transport
            const transport = new StdioClientTransport(transportOptions);
            
            // Create tool service
            const toolService = new ToolService(mcp);
            
            // Connect
            try {
                mcp.connect(transport);
                // console.log(`Connected to server: ${serverIdentifier}`);
            } catch (connectError) {
                console.error(`Connection failed: ${connectError.message}`);
                throw connectError;
            }
            
            // Save connection
            this.connections.set(serverIdentifier, {
                mcp,
                transport,
                toolService,
                connected: true
            });
            
            // Get tools
            try {
                // console.log(`Getting tools from ${serverIdentifier}...`);
                const serverTools = await toolService.getTools();
                // console.log(`Got ${serverTools.length} tools from ${serverIdentifier}`);
                
                // Tag tools with server
                const taggedTools = serverTools.map(tool => ({
                    ...tool,
                    serverIdentifier // For routing calls
                }));
                
                // Merge tools
                this.tools = [...this.tools, ...taggedTools];
                
                if (serverTools.length === 0) {
                    console.warn(`Warning: Server ${serverIdentifier} provided no tools`);
                } else {
                    // 简化输出格式，去掉"MCP Server Name"前缀
                    console.log(`- ${serverIdentifier}\n      - ${serverTools.map(t => t.name).join('\n      - ')}`);
                }
            } catch (toolError) {
                console.error(`Failed to get tools from ${serverIdentifier}: ${toolError.message}`);
                console.error(toolError);
            }
            
            // Set auto-approve
            if (config && config.mcpServers && config.mcpServers[serverIdentifier]) {
                const autoApproveList = config.mcpServers[serverIdentifier].autoApprove || [];
                toolService.setAutoApproveList(autoApproveList, true);
                // console.log(`Auto-approving all tools from ${serverIdentifier}`);
            }
            
            return true;
        }
        catch (error) {
            console.error(`Connection to ${serverIdentifier} failed: ${error.message}`);
            console.error(error);
            return false;
        }
    }

    /**
     * Call MCP tool
     * @param {string} toolName Tool name
     * @param {Object} toolArgs Tool arguments
     * @returns {Promise<Object>} Result
     */
    async callTool(toolName, toolArgs) {
        // Find tool's server
        const tool = this.tools.find(t => t.name === toolName);
        if (!tool) {
            throw new Error(`Tool ${toolName} not found`);
        }
        
        const serverIdentifier = tool.serverIdentifier;
        if (!serverIdentifier) {
            throw new Error(`Tool ${toolName} has no server identifier`);
        }
        
        const connection = this.connections.get(serverIdentifier);
        if (!connection || !connection.connected) {
            throw new Error(`Not connected to server ${serverIdentifier} for tool ${toolName}`);
        }
        
        try {
            return await connection.toolService.callTool(toolName, toolArgs);
        } catch (error) {
            console.error(`Tool call failed ${toolName}:`, error);
            throw error;
        }
    }

    /**
     * Get available tools
     * @returns {Array} Tools
     */
    getTools() {
        return this.tools;
    }

    /**
     * Disconnect from server
     * @param {string} serverIdentifier Server ID
     */
    async disconnectServer(serverIdentifier) {
        const connection = this.connections.get(serverIdentifier);
        if (connection && connection.connected) {
            try {
                await connection.mcp.disconnect();
                connection.connected = false;
                
                // Remove server's tools
                this.tools = this.tools.filter(tool => tool.serverIdentifier !== serverIdentifier);
                
                console.log(`Disconnected from server ${serverIdentifier}`);
            } catch (error) {
                console.error(`Disconnect failed ${serverIdentifier}:`, error);
            }
        }
    }

    /**
     * Disconnect from all servers
     */
    async disconnect() {
        for (const serverIdentifier of this.connections.keys()) {
            await this.disconnectServer(serverIdentifier);
        }
        this.tools = [];
    }

    /**
     * Check if connected to server
     * @param {string} serverIdentifier Server ID
     * @returns {boolean} Connected status
     */
    isServerConnected(serverIdentifier) {
        const connection = this.connections.get(serverIdentifier);
        return connection ? connection.connected : false;
    }
    
    /**
     * Check if connected to any server
     * @returns {boolean} Connected status
     */
    isConnected() {
        for (const connection of this.connections.values()) {
            if (connection.connected) {
                return true;
            }
        }
        return false;
    }
    
    /**
     * Clean up resources
     */
    async cleanup() {
        await this.disconnect();
    }

    /**
     * Call tool from specific server
     * @param {string} serverIdentifier Server ID
     * @param {string} toolName Tool name
     * @param {Object|string} toolArgs Tool arguments
     * @returns {Promise<Object>} Result
     */
    async callToolFromServer(serverIdentifier, toolName, toolArgs) {
        const connection = this.connections.get(serverIdentifier);
        if (!connection || !connection.connected) {
            throw new Error(`Not connected to server ${serverIdentifier}`);
        }
        
        try {
            return await connection.toolService.callTool(toolName, toolArgs);
        } catch (error) {
            console.error(`Tool call failed ${toolName} from ${serverIdentifier}:`, error);
            throw error;
        }
    }

    /**
     * Get formatted tool information
     * @returns {string} Tool info
     */
    getMCPToolsInfo() {
        if (this.tools.length === 0) {
            return "### Available Tools\nNo tools available.";
        }

        // Group by server
        const toolsByServer = new Map();
        
        for (const tool of this.tools) {
            if (!toolsByServer.has(tool.serverIdentifier)) {
                toolsByServer.set(tool.serverIdentifier, []);
            }
            toolsByServer.get(tool.serverIdentifier).push(tool);
        }
        
        // Build info string
        let result = "### Available Tools\n";
        
        // Add each server's tools
        for (const [serverName, serverTools] of toolsByServer.entries()) {
            result += `\n## ${serverName} Server\n`;
            
            // Add each tool
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