export function parseBooleanEnv(value, name = 'environment variable') {
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    throw new Error(`${name} must be a boolean value (true/false, 1/0, yes/no, on/off).`);
}

export function parseIntegerEnv(value, name = 'environment variable') {
    const normalized = String(value).trim();
    if (!/^-?\d+$/.test(normalized)) {
        throw new Error(`${name} must be an integer.`);
    }
    return Number.parseInt(normalized, 10);
}

export function parseJsonEnv(value, name = 'environment variable') {
    try {
        return JSON.parse(value);
    } catch (error) {
        throw new Error(`${name} must contain valid JSON: ${error.message}`);
    }
}
