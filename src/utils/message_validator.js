/**
 * Validates and sanitizes user messages for safety.
 * Prevents protocol exploits, injection attacks, and abuse.
 */

const MAX_DISCORD_MESSAGE_LENGTH = 512;
const MAX_MINECRAFT_MESSAGE_LENGTH = 256;

// Patterns that may indicate command injection or abuse
const COMMAND_INJECTION_PATTERNS = [
    /;\s*(rm|del|format|shutdown|reboot|kill|wget|curl)\b/i,
    /\$\(.*\)/,                    // Shell command substitution
    /`[^`]*`/,                     // Backtick command execution
    /\|\s*(bash|sh|cmd|powershell)/i,  // Pipe to shell
];

/**
 * Validates a Discord message
 * @param {string} message - Raw message from Discord user
 * @returns {object} { valid: boolean, error?: string, sanitized?: string, warnings?: string[] }
 */
export function validateDiscordMessage(message) {
    if (!message) return { valid: false, error: 'Empty message' };
    if (typeof message !== 'string') return { valid: false, error: 'Message must be a string' };
    if (message.length > MAX_DISCORD_MESSAGE_LENGTH) {
        return { valid: false, error: `Message exceeds ${MAX_DISCORD_MESSAGE_LENGTH} characters` };
    }

    // Block command injection patterns outright — do not pass these to agents.
    for (const pattern of COMMAND_INJECTION_PATTERNS) {
        if (pattern.test(message)) {
            console.warn(`[MessageValidator] Blocked message containing disallowed pattern: ${pattern.source}`);
            return { valid: false, error: `Message contains a disallowed pattern and was blocked.` };
        }
    }

    const warnings = [];

    // Alert on suspicious patterns (but allow them for agents to handle)
    const suspiciousPatterns = [
        /[\x00-\x08\x0B-\x0C\x0E-\x1F]/g,  // Control characters
        /[\uFEFF]/g,  // BOM
    ];

    let sanitized = message;
    for (const pattern of suspiciousPatterns) {
        sanitized = sanitized.replace(pattern, '');
    }

    if (sanitized !== message) {
        warnings.push('Removed control characters from message');
        console.warn('[MessageValidator] Removed control characters from Discord message');
    }

    return { valid: true, sanitized, warnings: warnings.length > 0 ? warnings : undefined };
}

/**
 * Validates a Minecraft in-game message
 * @param {string} message - Raw message from Minecraft chat
 * @returns {object} { valid: boolean, error?: string, sanitized?: string }
 */
export function validateMinecraftMessage(message) {
    if (!message) return { valid: false, error: 'Empty message' };
    if (typeof message !== 'string') return { valid: false, error: 'Message must be a string' };
    if (message.length > MAX_MINECRAFT_MESSAGE_LENGTH) {
        return { valid: false, error: `Message exceeds ${MAX_MINECRAFT_MESSAGE_LENGTH} characters` };
    }

    // Minecraft chat allows most characters; filter only dangerous ones
    const dangerousPatterns = [
        /[\x00]/g,  // Null byte (protocol exploit)
        /\n/g,      // Newlines (message splitting)
        /\r/g,      // Carriage return
    ];

    let sanitized = message;
    for (const pattern of dangerousPatterns) {
        sanitized = sanitized.replace(pattern, ' ');
    }

    return { valid: true, sanitized };
}

/**
 * Validates a username (bot or player name)
 * @param {string} username - Username to validate
 * @returns {object} { valid: boolean, error?: string }
 */
export function validateUsername(username) {
    if (!username) return { valid: false, error: 'Username is empty' };
    if (typeof username !== 'string') return { valid: false, error: 'Username must be a string' };
    if (!/^[a-zA-Z0-9_]{3,16}$/.test(username)) {
        return { valid: false, error: 'Username must be 3-16 alphanumeric chars or underscore' };
    }
    return { valid: true };
}
