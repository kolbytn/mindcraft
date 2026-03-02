import * as Mindcraft from './src/mindcraft/mindcraft.js';
import settings from './settings.js';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { readFileSync, existsSync } from 'fs';

/**
 * Safely parse JSON with a descriptive error on failure.
 */
function safeJsonParse(str, label) {
    try {
        return JSON.parse(str);
    } catch (err) {
        throw new Error(`Failed to parse ${label}: ${err.message}`);
    }
}

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
    if (!existsSync(args.task_path)) {
        throw new Error(`Task file not found: ${args.task_path}`);
    }
    let tasks = safeJsonParse(readFileSync(args.task_path, 'utf8'), `task file "${args.task_path}"`);
    if (args.task_id) {
        if (!(args.task_id in tasks)) {
            throw new Error(`Task ID "${args.task_id}" not found in task file`);
        }
        settings.task = tasks[args.task_id];
        settings.task.task_id = args.task_id;
    }
    else {
        throw new Error('task_id is required when task_path is provided');
    }
}

// these environment variables override certain settings
if (process.env.MINECRAFT_PORT) {
    settings.port = parseInt(process.env.MINECRAFT_PORT, 10) || 19565;
}
if (process.env.MINDSERVER_PORT) {
    settings.mindserver_port = parseInt(process.env.MINDSERVER_PORT, 10) || 8080;
}
if (process.env.PROFILES) {
    const profiles = safeJsonParse(process.env.PROFILES, 'PROFILES env var');
    if (Array.isArray(profiles) && profiles.length > 0) {
        settings.profiles = profiles;
    }
}
if (process.env.INSECURE_CODING) {
    settings.allow_insecure_coding = true;
}
if (process.env.BLOCKED_ACTIONS) {
    settings.blocked_actions = safeJsonParse(process.env.BLOCKED_ACTIONS, 'BLOCKED_ACTIONS env var');
}
if (process.env.MAX_MESSAGES) {
    settings.max_messages = parseInt(process.env.MAX_MESSAGES, 10) || settings.max_messages;
}
if (process.env.NUM_EXAMPLES) {
    settings.num_examples = parseInt(process.env.NUM_EXAMPLES, 10) || settings.num_examples;
}
if (process.env.LOG_ALL) {
    settings.log_all_prompts = process.env.LOG_ALL === 'true' || process.env.LOG_ALL === '1';
}

if (settings.mindserver_url) {
    console.log(`Remote MindServer mode: agents will connect to ${settings.mindserver_url}`);
} else {
    Mindcraft.init(settings.mindserver_host_public === true, settings.mindserver_port, settings.auto_open_ui);
}

for (let profile of settings.profiles) {
    if (!existsSync(profile)) {
        console.error(`Profile not found: ${profile} — skipping`);
        continue;
    }
    try {
        const profile_json = safeJsonParse(readFileSync(profile, 'utf8'), `profile "${profile}"`);
        settings.profile = profile_json;
        if (settings.mindserver_url) {
            await Mindcraft.createRemoteAgent(settings, settings.mindserver_url);
        } else {
            Mindcraft.createAgent(settings);
        }
    } catch (err) {
        console.error(`Failed to load profile "${profile}": ${err.message}`);
    }
}