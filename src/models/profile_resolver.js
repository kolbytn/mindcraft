import { readFileSync } from 'fs';
import path from 'path';

const BASE_PROFILE_FILES = {
    survival: 'survival.json',
    assistant: 'assistant.json',
    creative: 'creative.json',
    god_mode: 'god_mode.json',
};

function readJson(filePath) {
    return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function resolveProfile(profile, baseProfileName, defaultsDir) {
    const defaultProfile = readJson(path.join(defaultsDir, '_default.json'));
    const matchedBase = Object.keys(BASE_PROFILE_FILES)
        .find(name => String(baseProfileName).includes(name));

    if (!matchedBase) {
        throw new Error(`Unknown base profile: ${baseProfileName}`);
    }

    const baseProfile = readJson(path.join(defaultsDir, BASE_PROFILE_FILES[matchedBase]));

    // Preserve the current merge semantics: defaults fill the base profile,
    // then the merged base fills only keys omitted by the individual profile.
    for (const [key, value] of Object.entries(defaultProfile)) {
        if (baseProfile[key] === undefined)
            baseProfile[key] = value;
    }
    for (const [key, value] of Object.entries(baseProfile)) {
        if (profile[key] === undefined)
            profile[key] = value;
    }

    return profile;
}
