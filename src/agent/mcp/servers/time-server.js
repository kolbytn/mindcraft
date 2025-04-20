/**
 * Local MCP Server code example
 * Simple MCP server providing a tool to get current time
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import process from 'process';

/**
 * Create MCP server instance
 */
const server = new McpServer({
    name: "TimeServer", // Server name
    version: "1.0.0",   // Server version
});

/**
 * Add a tool to get current time
 * Params: timezone (optional)
 * Returns: Formatted current time string
 */
server.tool("getCurrentTime", // Tool name
"Get current time based on timezone (optional)", // Tool description
{
    timezone: z
        .string()
        .optional()
        .describe("Timezone, e.g. 'Asia/Shanghai', 'America/New_York', etc. (System default if not provided)"),
}, async ({ timezone }) => {
    try {
        // Get current time
        const now = new Date();
        // Format time according to provided timezone
        let formattedTime;
        if (timezone) {
            // Create a microtask to satisfy async/await requirement
            await Promise.resolve();
            
            formattedTime = new Intl.DateTimeFormat("en-US", {
                timeZone: timezone,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
                timeZoneName: "short",
            }).format(now);
        }
        else {
            // Use system default timezone
            formattedTime = now.toLocaleString("en-US", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
            });
        }
        // Return formatted time string
        return {
            content: [
                {
                    type: "text",
                    text: `Current time: ${formattedTime}${timezone ? ` (Timezone: ${timezone})` : ""}`,
                },
            ],
        };
    }
    catch (error) {
        // Handle possible errors (e.g., invalid timezone)
        return {
            content: [
                {
                    type: "text",
                    text: `Error getting time: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        };
    }
});

/**
 * Start server, connect to standard input/output transport
 */
async function startServer() {
    try {
        // Create standard input/output transport
        const transport = new StdioServerTransport();
        // Connect server to transport
        await server.connect(transport);
    }
    catch (error) {
        console.error("Error starting server:", error);
        process.exit(1);
    }
}
// start server
startServer().catch(err => console.error("Server error:", err));
