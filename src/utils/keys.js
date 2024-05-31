import { readFileSync } from 'fs';

let keys = {};
try {
    const data = readFileSync('./keys.json', 'utf8');
    keys = JSON.parse(data);
} catch (err) {
    console.warn('keys.json not found. Defaulting to environment variables.'); // still works with local models
}

export function getKey(name) {
    let key = keys[name];
    if (!key) {
        key = process.env[name];
    }
    if (!key) {
        throw new Error(`API key "${name}" not found in keys.json or environment variables!`);
    }
    return keys[name];
}

export function hasKey(name) {
    return keys[name] || process.env[name];
}
