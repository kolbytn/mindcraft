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
        this.mcp = mcp; 
        this.autoApproveList = []; 
        this.autoApproveAll = true; 
    }
    
    /**
     * Get list of available tools
     * @returns {Promise<Array>}
     */
    async getTools() {
        try {

            const toolsResult = await this.mcp.listTools();
            
            if (!toolsResult || !toolsResult.tools) {
                console.warn("Failed to get tool list, server did not return tool information");
                return [];
            }
            const tools = toolsResult.tools;

            return tools;
        } catch (error) {
            console.error("Failed to get tool list:", error);
            throw error;
        }
    }
    
    /**
     * Call MCP tool
     * @param {string} toolName 
     * @param {Object} toolArgs 
     * @returns {Promise<Object>} 
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
     * @param {string} toolName 
     * @returns {Promise<Object|null>} 
     */
    async findTool(toolName) {
        try {
            const tools = await this.getTools();
            return tools.find(tool => tool.name === toolName) || null;
        } catch (error) {
            console.error(`Failed to find tool ${toolName}:`, error);
            return null; 
        }
    }
    
    /**
     * Set auto-approve tool list
     * @param {Array<string>} toolNames
     * @param {boolean} autoApproveAll 
     */
    setAutoApproveList(toolNames, autoApproveAll = true) {
        this.autoApproveAll = autoApproveAll;
        
        if (Array.isArray(toolNames)) {
            this.autoApproveList = [...toolNames];
        } else {
            this.autoApproveList = [];
        }
        
    }
    
    /**
     * Check if tool should be auto-approved
     * @param {string} toolName 
     * @returns {boolean}
     */
    shouldAutoApprove(toolName) {
        return this.autoApproveList.includes(toolName);
    }
} 