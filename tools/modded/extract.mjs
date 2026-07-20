#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

function arg(name, fallback) {
    const i = process.argv.indexOf('--' + name);
    if (i === -1 || i + 1 >= process.argv.length) return fallback;
    return process.argv[i + 1];
}

const serverDir = arg('server-dir', null);
const outputDir = resolve(arg('output', './modded_data'));

if (!serverDir) {
    console.error('Usage: node tools/modded/extract.mjs --server-dir <path-to-forge-server> [--output <dir>]');
    console.error('');
    console.error('Extracts modded block data from a Forge server that has the StateDumper mod installed.');
    console.error('Items/entities are captured automatically on first bot connect (no manual step needed).');
    process.exit(1);
}

const resolvedServerDir = resolve(serverDir);
if (!existsSync(resolvedServerDir)) {
    console.error(`Server directory not found: ${resolvedServerDir}`);
    process.exit(1);
}

// Look for StateDumper output in common locations
const candidates = [
    join(resolvedServerDir, 'blockstates.json'),
    join(resolvedServerDir, 'dumps', 'blockstates.json'),
    join(resolvedServerDir, 'config', 'blockstates.json'),
];

let stateDumpPath = null;
for (const p of candidates) {
    if (existsSync(p)) {
        stateDumpPath = p;
        break;
    }
}

if (!stateDumpPath) {
    console.error('Could not find blockstates.json in your server directory.');
    console.error('');
    console.error('The StateDumper mod must be installed and run once on the server to produce this file.');
    console.error('Steps:');
    console.error('  1. Build the StateDumper mod: cd tools/modded/statedumper && ./gradlew build');
    console.error('     (requires JDK 17 for MC 1.19.2)');
    console.error('  2. Copy build/libs/statedumper-1.0.0.jar into your server\'s mods/ folder');
    console.error('  3. Start the server once - the mod writes blockstates.json on startup then exits');
    console.error('  4. Re-run this command');
    console.error('');
    console.error('Searched:');
    for (const c of candidates) console.error(`  ${c}`);
    process.exit(1);
}

console.log(`Found state dump: ${stateDumpPath}`);

// We also need modded_registries.json for the convert step's cross-check.
// Check output dir first (auto-captured by the bot), then server dir.
let registriesPath = join(outputDir, 'modded_registries.json');
if (!existsSync(registriesPath)) {
    const altPath = join(resolvedServerDir, 'modded_registries.json');
    if (existsSync(altPath)) registriesPath = altPath;
}

if (!existsSync(registriesPath)) {
    console.error('modded_registries.json not found.');
    console.error('This file is auto-captured when a bot first connects to the Forge server.');
    console.error('Start a bot with forge: true in settings.js, then re-run this command.');
    console.error(`Searched: ${join(outputDir, 'modded_registries.json')}`);
    process.exit(1);
}

console.log(`Using registries: ${registriesPath}`);

mkdirSync(outputDir, { recursive: true });

// Run convert.js
const convertScript = join(__dirname, 'convert.cjs');
try {
    const result = execFileSync(process.execPath, [convertScript, registriesPath, stateDumpPath, outputDir], {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
    });
    console.log(result);
} catch (e) {
    console.error('convert.js failed:');
    console.error(e.stderr || e.message);
    process.exit(1);
}

console.log(`Output written to ${outputDir}`);
console.log('Block data is ready. Set forge_inject_blocks: true in settings.js to use it.');
