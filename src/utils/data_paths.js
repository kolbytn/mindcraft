import path from 'path';
import { fileURLToPath } from 'url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dataRoot = process.env.MINDCRAFT_DATA_DIR
    ? path.resolve(process.env.MINDCRAFT_DATA_DIR)
    : projectRoot;

export function getDataRoot() {
    return dataRoot;
}

export function botDataPath(agentName, ...parts) {
    return path.join(dataRoot, 'bots', agentName, ...parts);
}
