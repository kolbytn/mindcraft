import { readFileSync } from 'fs';
import { deepSanitize } from '../../settings.js';

let keys = {};
let keysLoaded = false;
const _warnedKeys = new Set();

// Try to load keys.json only if it exists, but prefer environment variables
function loadKeysFile() {
    if (keysLoaded) return;
    try {
        const data = readFileSync('./keys.json', 'utf8');
        keys = deepSanitize(JSON.parse(data));
        console.warn('⚠️  WARNING: keys.json loaded into memory. Use environment variables instead for better security.');
    } catch (_err) {
        // keys.json not found or unreadable — that's fine, use env vars
    }
    keysLoaded = true;
}

export function getKey(name) {
    // Priority 1: Environment variables (most secure)
    let key = process.env[name];
    if (key) {
        return key;
    }

    // Priority 2: keys.json fallback (legacy, less secure)
    loadKeysFile();
    key = keys[name];
    if (key) {
        if (!_warnedKeys.has(name)) {
            _warnedKeys.add(name);
            console.warn(`\u26A0\uFE0F  Using key from keys.json for "${name}". Migrate to environment variables.`);
        }
        return key;
    }

    throw new Error(`API key "${name}" not found in environment variables or keys.json. Set ${name} as an environment variable.`);
}

export function hasKey(name) {
    // Check env vars first
    if (process.env[name]) return true;

    // Check keys.json as fallback
    loadKeysFile();
    return !!keys[name];
}
