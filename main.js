import { AgentProcess } from './src/process/agent-process.js';
import settings from './settings.js';
import yargs from 'yargs';
import { loadTask } from './src/utils/tasks.js';
import { hideBin } from 'yargs/helpers';
import { readFileSync, writeFileSync } from 'fs';
import { createMindServer } from './src/server/mind_server.js';

function parseArguments() {
    return yargs(hideBin(process.argv))
        .option('profiles', {
            type: 'array',
            describe: 'List of agent profile paths',
        })
        .option('task', {
            type: 'string',
            describe: 'Task ID to execute'
        })
        .option('model', {
            type: 'string',
            describe: 'LLM model to use',
        })
        .help()
        .alias('help', 'h')
        .parse();
}

function updateProfile(profile, args) {
    var temp_profile = JSON.parse(readFileSync(profile, 'utf8'));
    temp_profile.model = args.model;
    writeFileSync(profile, JSON.stringify(temp_profile, null, 2));
    return profile;
}

//todo: modify for multiple agents
function getProfiles(args) {

    if (args.task) {
        var task = loadTask(args.task);
    }

    if (args.model) {
        if (! args.task) {
            settings.profiles = settings.profiles.map(x => updateProfile(x, args));
            }

        else {
            if ('agent_number' in task && task.agent_number > 1) {
                updateProfile('./multiagent_prompt_desc.json', args);
            }
            else {
                updateProfile('./task_andy.json', args);
            }
        }
    }   

    if (args.task) {

        var task = loadTask(args.task);
        if ('agent_number' in task && task.agent_number > 1) {
            var profile = JSON.parse(readFileSync('./multiagent_prompt_desc.json', 'utf8'));
            var agent_names = task.agent_names;
            var filenames = [];
            for (let i=0; i<task.agent_number; i++) {
                let temp_profile = profile;
                temp_profile.name = agent_names[i];

                var filename = `multi_agent_task_${agent_names[i]}.json`;
                writeFileSync(filename, JSON.stringify(temp_profile, null, 2));
                filenames.push(filename);
            }
            return filenames;
        } else {
            return ['./task_andy.json'];
        }
    }

    return args.profiles || settings.profiles;
}

function determine_init_message(task, agent_index) {
    if (task) {
        if ('agent_number' in task && task.agent_number > 1) {
            if (agent_index == 0) {
                // first agent gets this init message
                return "Immediately start a conversation and collaborate together to complete the task. Share resources and skill sets. Use the !startConversation function if needed."
            }   // all other agents get this init message
            return "Collaborate together to complete the task. Share resources and skill sets."
        }
        return "Announce your task to everyone and get started with it immediately, set a goal if needed, if cheats are enabled then feel free to use newAction commands, no need to collect or mine or gather any items"
    }
    return settings.init_message;
}

async function main() {

    if (settings.host_mindserver) {
        const mindServer = createMindServer();
    }
    const args = parseArguments();

    if (args.task) {
        var task = loadTask(args.task);
        // Inject task information into process.env for the agent to access
        process.env.MINECRAFT_TASK_GOAL = task.goal;
        
        if ('agent_number' in task && task.agent_number > 1) {
            process.env.ALL_AGENT_NAMES = task.agent_names;
            console.log(`All agents for this task are ${process.env.ALL_AGENT_NAMES}`);
        }
    }
    // todo: do inventory
    const profiles = getProfiles(args);

    console.log(profiles);
    // var { load_memory, init_message } = settings;
    var load_memory = settings.load_memory;
    var init_message = settings.init_message;

    for (let i=0; i<profiles.length; i++) {
        try {
            const agent = new AgentProcess();
            if (args.task) {
                init_message = determine_init_message(task, i);
            }
            agent.start(profiles[i], load_memory, init_message, i, args.task);
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (err) {
            console.error(`Failed to start agent ${profiles[i]}:`, err);
        }
    }

}

try {
    main();
} catch (error) {
    console.error('An error occurred:', error);
    process.exit(1);
}