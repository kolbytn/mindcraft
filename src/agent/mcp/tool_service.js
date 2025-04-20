/**
 * MCP Tool Service Class
 *
 * Responsible for getting and calling MCP tools
 */

/**
 * Tool Service Class
 * Manages MCP tool retrieval and invocation
 */
export class ToolService {
    constructor(mcp) {
        this.mcp = mcp; // MCP client instance
        this.autoApproveList = []; // List of auto-approved tools
        this.autoApproveAll = true; // Default to auto-approve all tools
    }
    
    /**
     * Get list of available tools
     * @returns {Promise<Array>} List of tools
     */
    async getTools() {
        try {
            // Use correct MCP SDK API to get tool list
            const toolsResult = await this.mcp.listTools();
            // console.log("Original tool response:", JSON.stringify(toolsResult));
            
            if (!toolsResult || !toolsResult.tools) {
                console.warn("Failed to get tool list, server did not return tool information");
                return [];
            }
            
            // Extract tool information and log - keep complete information
            const tools = toolsResult.tools;
            
            // 不打印详细工具信息，只输出工具数量
            // console.log("Available tools:", JSON.stringify(tools));
            
            // Return tool list
            return tools;
        } catch (error) {
            console.error("Failed to get tool list:", error);
            throw error; // Let upper layer handle exception
        }
    }
    
    /**
     * Call MCP tool
     * @param toolName Tool name
     * @param toolArgs Tool arguments
     * @returns Tool invocation result
     */
    async callTool(toolName, toolArgs) {
        try {
            // Execute tool call
            const result = await this.mcp.callTool({
                name: toolName,
                arguments: toolArgs,
            });
            return result;
        }
        catch (error) {
            throw new Error(`Failed to call tool ${toolName}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    
    /**
     * Find tool by name
     * @param {string} toolName Tool name
     * @returns {Promise<Object|null>} Tool object or null
     * @private
     */
    async findTool(toolName) {
        try {
            const tools = await this.getTools();
            return tools.find(tool => tool.name === toolName) || null;
        } catch (error) {
            console.error(`Failed to find tool ${toolName}:`, error);
            return null; // Return null if getting tool list fails
        }
    }
    
    /**
     * Set auto-approve tool list
     * @param {Array<string>} toolNames List of tool names
     * @param {boolean} autoApproveAll Whether to auto-approve all tools
     */
    setAutoApproveList(toolNames, autoApproveAll = true) {
        // Set whether to auto-approve all tools
        this.autoApproveAll = autoApproveAll;
        
        // If specific tool list is provided, set to that list
        if (Array.isArray(toolNames)) {
            this.autoApproveList = [...toolNames];
            // console.log(`Auto-approve tool list set: ${this.autoApproveList.join(', ') || 'none'}`);
        } else {
            this.autoApproveList = [];
            // console.log('No auto-approve tool list provided, will auto-approve all tools');
        }
        
        // console.log(`Auto-approve all tools: ${this.autoApproveAll}`);
    }
    
    /**
     * Check if tool should be auto-approved
     * @param {string} toolName Tool name
     * @returns {boolean} Whether to auto-approve
     * @private
     */
    shouldAutoApprove(toolName) {
        return this.autoApproveList.includes(toolName);
    }
} 