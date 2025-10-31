import { spawn } from 'child_process';
import { strictFormat } from '../utils/text.js';

/**
 * ClaudeCode model adapter - Proxies requests to Claude Code CLI
 *
 * This adapter enables mindcraft bots to use Claude Code subscription instead of API keys.
 * It spawns fresh Claude Code instances for each request, giving access to:
 * - MCP tools (like context-foundry)
 * - Fresh 200K context windows
 * - No API costs
 */
export class ClaudeCode {
    static prefix = 'claudecode';

    constructor(model_name, url, params) {
        // Use latest Sonnet model or let Claude Code use its default
        this.model_name = model_name || 'claude-sonnet-4-5-20250929';
        this.params = params || {};
        this.timeout = (params && params.timeout) || 120000; // 2 minute default timeout
    }

    async sendRequest(turns, systemMessage) {
        const messages = strictFormat(turns);

        try {
            console.log(`Awaiting Claude Code response (model: ${this.model_name})...`);

            // Build the prompt combining system message and conversation
            let fullPrompt = systemMessage + '\n\n';
            fullPrompt += 'Recent conversation:\n';
            for (const msg of messages) {
                fullPrompt += `${msg.role}: ${msg.content}\n`;
            }

            // Execute Claude Code CLI
            const result = await this._executeClaudeCLI(fullPrompt);

            console.log('Received.');
            return result;

        } catch (err) {
            console.error('Claude Code error:', err);
            return "My brain disconnected, try again.";
        }
    }

    async _executeClaudeCLI(prompt) {
        return new Promise((resolve, reject) => {
            // Build command - pass prompt via stdin to avoid shell escaping issues
            // --print: non-interactive mode
            // --permission-mode bypassPermissions: skip permission prompts
            const args = [
                '--print',
                '--permission-mode', 'bypassPermissions',
                '--model', this.model_name
            ];

            console.log('[ClaudeCode] Spawning claude with model:', this.model_name);

            const proc = spawn('claude', args, {
                stdio: ['pipe', 'pipe', 'pipe'],  // stdin, stdout, stderr
                env: {
                    ...process.env,
                    PYTHONUNBUFFERED: '1'
                }
            });

            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', (data) => {
                const chunk = data.toString();
                stdout += chunk;
            });

            proc.stderr.on('data', (data) => {
                const chunk = data.toString();
                stderr += chunk;
            });

            // Write prompt to stdin and close it
            try {
                proc.stdin.write(prompt);
                proc.stdin.end();
            } catch (err) {
                console.error('[ClaudeCode] Error writing to stdin:', err);
                reject(err);
                return;
            }

            // Timeout handler
            const timeoutId = setTimeout(() => {
                console.log('[ClaudeCode] Timeout reached, killing process');
                proc.kill();
                reject(new Error(`Claude Code timeout after ${this.timeout}ms`));
            }, this.timeout);

            proc.on('close', (code) => {
                clearTimeout(timeoutId);
                console.log(`[ClaudeCode] Process closed with code: ${code}`);

                if (code === 0) {
                    // Clean up the output
                    let result = stdout.trim();

                    // Remove thinking blocks if present
                    if (result.includes('<think>') && result.includes('</think>')) {
                        result = result.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
                    }

                    console.log('[ClaudeCode] Response length:', result.length);
                    resolve(result || 'No response from Claude Code.');
                } else {
                    console.error(`[ClaudeCode] Error - Exit code: ${code}`);
                    if (stderr) console.error(`[ClaudeCode] Stderr: ${stderr}`);
                    if (stdout) console.error(`[ClaudeCode] Stdout: ${stdout}`);
                    reject(new Error(`Claude Code exited with code ${code}\nStderr: ${stderr}\nStdout: ${stdout}`));
                }
            });

            proc.on('error', (err) => {
                clearTimeout(timeoutId);
                console.error('[ClaudeCode] Spawn error:', err);
                reject(err);
            });
        });
    }

    async sendVisionRequest(turns, systemMessage, imageBuffer) {
        // Vision not yet supported through CLI proxy
        // Would need to save image to temp file and reference it
        throw new Error('Vision is not yet supported by Claude Code proxy adapter.');
    }

    async embed(text) {
        throw new Error('Embeddings are not supported by Claude Code proxy adapter.');
    }
}
