import * as Mindcraft from './src/mindcraft/mindcraft.js';
import settings from './settings.js';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { readFileSync } from 'fs';
import { parseBooleanEnv, parseIntegerEnv, parseJsonEnv } from './src/utils/env.js';

function parseArguments() {
    return yargs(hideBin(process.argv))
        .option('profiles', {
            type: 'array',
            describe: 'List of agent profile paths',
        })
        .option('task_path', {
            type: 'string',
            describe: 'Path to task file to execute'
        })
        .option('task_id', {
            type: 'string',
            describe: 'Task ID to execute'
        })
        .help()
        .alias('help', 'h')
        .parse();
}
const args = parseArguments();
if (args.profiles) {
    settings.profiles = args.profiles;
}
if (args.task_path) {
    let tasks = JSON.parse(readFileSync(args.task_path, 'utf8'));
    if (args.task_id) {
        settings.task = tasks[args.task_id];
        settings.task.task_id = args.task_id;
    }
    else {
        throw new Error('task_id is required when task_path is provided');
    }
}

// these environment variables override certain settings
if (process.env.MINECRAFT_PORT !== undefined) {
    settings.port = parseIntegerEnv(process.env.MINECRAFT_PORT, 'MINECRAFT_PORT');
}
if (process.env.MINDSERVER_PORT !== undefined) {
    settings.mindserver_port = parseIntegerEnv(process.env.MINDSERVER_PORT, 'MINDSERVER_PORT');
}
if (process.env.PROFILES !== undefined) {
    const profiles = parseJsonEnv(process.env.PROFILES, 'PROFILES');
    if (!Array.isArray(profiles)) {
        throw new Error('PROFILES must be a JSON array.');
    }
    if (profiles.length > 0) {
        settings.profiles = profiles;
    }
}
if (process.env.INSECURE_CODING !== undefined) {
    settings.allow_insecure_coding = parseBooleanEnv(process.env.INSECURE_CODING, 'INSECURE_CODING');
}
if (process.env.BLOCKED_ACTIONS !== undefined) {
    const blockedActions = parseJsonEnv(process.env.BLOCKED_ACTIONS, 'BLOCKED_ACTIONS');
    if (!Array.isArray(blockedActions)) {
        throw new Error('BLOCKED_ACTIONS must be a JSON array.');
    }
    settings.blocked_actions = blockedActions;
}
if (process.env.MAX_MESSAGES !== undefined) {
    settings.max_messages = parseIntegerEnv(process.env.MAX_MESSAGES, 'MAX_MESSAGES');
}
if (process.env.NUM_EXAMPLES !== undefined) {
    settings.num_examples = parseIntegerEnv(process.env.NUM_EXAMPLES, 'NUM_EXAMPLES');
}
if (process.env.LOG_ALL !== undefined) {
    settings.log_all_prompts = parseBooleanEnv(process.env.LOG_ALL, 'LOG_ALL');
}
if (process.env.SETTINGS_JSON) {
    try {
        Object.assign(settings, parseJsonEnv(process.env.SETTINGS_JSON, 'SETTINGS_JSON'));
    } catch (err) {
        console.error('Failed to parse environment variable for SETTINGS_JSON:', err);
    }
}


Mindcraft.init(false, settings.mindserver_port, settings.auto_open_ui);

for (let profile of settings.profiles) {
    const profile_json = JSON.parse(readFileSync(profile, 'utf8'));
    settings.profile = profile_json;
    Mindcraft.createAgent(settings);
}
