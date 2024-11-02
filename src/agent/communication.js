import settings from '../../settings.js';
import { readFileSync } from 'fs';

const agent_names = settings.profiles.map((p) => JSON.parse(readFileSync(p, 'utf8')).name);

export function isOtherAgent(name) {
    return agent_names.some((n) => n === name);
}