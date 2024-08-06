import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import * as mc from "../../utils/mcdata.js";
import Vec3 from 'vec3';

// Function to dynamically load a module
async function dynamicLoadModule(modulePath) {
    const moduleURL = pathToFileURL(modulePath).href;
    return import(moduleURL + '?t=' + Date.now());
}

// Function to load all necessary modules
async function loadModules() {
    // Correctly calculate __filename and __dirname
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    // Get the parent directory
    const parentDirectory = path.resolve(__dirname, '..');
    const skillsPath = path.resolve(parentDirectory, 'library/skills.js');
    const worldPath = path.resolve(parentDirectory, 'library/world.js');

    // Dynamically load the modules
    const [skills, world] = await Promise.all([
        dynamicLoadModule(skillsPath),
        dynamicLoadModule(worldPath)
    ]);

    return { skills, world };
}

// Main function
export async function main(bot) {
    // Load modules
    const { skills, world } = await loadModules();

    const log = skills.log;

    /* CODE HERE */
    log(bot, 'Code finished.');
}