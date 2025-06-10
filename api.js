import * as Mindcraft from './mindcraft.js';
import { readFileSync } from 'fs';


await Mindcraft.init('localhost', 8080); // starts server locally
// await Mindcraft.connect('ip', 'port') // connects to remote server
// ^ must do one of these before calling anything else

let profile = JSON.parse(readFileSync('./profiles/gemini.json', 'utf8'));

Mindcraft.createAgent(
    {
        world: {
            "minecraft_version": "1.21.1", // supports up to 1.21.1
            "host": "127.0.0.1", // or "localhost", "your.ip.address.here"
            "port": 55916,
            "auth": "offline", // or "microsoft"
        },
        profile,
        "base_profile": "survival", // survival | creative | god_mode
        "load_memory": false, // load memory from previous session
        "init_message": "Respond with hello world and your name", // sends to all on spawn
        "only_chat_with": [], // users that the bots listen to and send general messages to. if empty it will chat publicly
        "speak": false, // allows all bots to speak through system text-to-speech. works on windows, mac, on linux you need to `apt install espeak`
        "language": "en", // translate to/from this language. Supports these language names: https://cloud.google.com/translate/docs/languages
        "allow_vision": false, // allows vision model to interpret screenshots as inputs
        "blocked_actions" : ["!checkBlueprint", "!checkBlueprintLevel", "!getBlueprint", "!getBlueprintLevel"] , // commands to disable and remove from docs. Ex: ["!setMode"]
        "relevant_docs_count": 5, // number of relevant code function docs to select for prompting. -1 for all
        "max_messages": 15, // max number of messages to keep in context
        "num_examples": 2, // number of examples to give to the model
        "max_commands": -1, // max number of commands that can be used in consecutive responses. -1 for no limit
        "narrate_behavior": true, // chat simple automatic actions ('Picking up item!')
        "log_all_prompts": false, // log ALL prompts to file
        // "task": {
        //     "task_id": "multiagent_crafting_pink_wool_full_plan__depth_0",
        //     "goal": "Collaborate with other agents to craft an pink_wool",
        //     "conversation": "Let's work together to craft an pink_wool.",
        //     "initial_inventory": {
        //         "0": {
        //         "pink_dye": 1
        //         }
        //     },
        //     "agent_count": 1,
        //     "target": "pink_wool",
        //     "number_of_target": 1,
        //     "type": "techtree",
        //     "max_depth": 1,
        //     "depth": 0,
        //     "timeout": 300,
        //     "blocked_actions": {
        //         "0": [],
        //     },
        //     "missing_items": [],
        //     "requires_ctable": false
        // },
        "verbose_commands": true, // show full command syntax
        "chat_bot_messages": true, // publicly chat bot-to-bot messages
    
        // mindserver settings
        "render_bot_view": false, // show bot's view in browser at localhost:3000, 3001...
        "allow_insecure_coding": true, // allows newAction command and model can write/run code on your computer. enable at own risk
        "code_timeout_mins": -1, // minutes code is allowed to run. -1 for no timeout
    }
)

// profile = JSON.parse(readFileSync('./andy.json', 'utf8'));

// Mindcraft.createAgent(
//     {
//         world: {
//             "minecraft_version": "1.21.1", // supports up to 1.21.1
//             "host": "127.0.0.1", // or "localhost", "your.ip.address.here"
//             "port": 55916,
//             "auth": "offline", // or "microsoft"
//         },
//         profile,
//         "base_profile": "survival", // also see creative.json, god_mode.json
//         "load_memory": false, // load memory from previous session
//         "init_message": "Respond with hello world and your name", // sends to all on spawn
//         "only_chat_with": [], // users that the bots listen to and send general messages to. if empty it will chat publicly
//         "speak": false, // allows all bots to speak through system text-to-speech. works on windows, mac, on linux you need to `apt install espeak`
//         "language": "en", // translate to/from this language. Supports these language names: https://cloud.google.com/translate/docs/languages
//         "allow_vision": false, // allows vision model to interpret screenshots as inputs
//         "blocked_actions" : ["!checkBlueprint", "!checkBlueprintLevel", "!getBlueprint", "!getBlueprintLevel"] , // commands to disable and remove from docs. Ex: ["!setMode"]
//         "relevant_docs_count": 5, // number of relevant code function docs to select for prompting. -1 for all
//         "max_messages": 15, // max number of messages to keep in context
//         "num_examples": 2, // number of examples to give to the model
//         "max_commands": -1, // max number of commands that can be used in consecutive responses. -1 for no limit
//         "narrate_behavior": true, // chat simple automatic actions ('Picking up item!')
//         "log_all_prompts": false, // log ALL prompts to file
//         "task_file": "",
//         "task_name": "",
//         "verbose_commands": true, // show full command syntax
//         "chat_bot_messages": true, // publicly chat bot-to-bot messages
    
//         // mindserver settings
//         "render_bot_view": false, // show bot's view in browser at localhost:3000, 3001...
//         "allow_insecure_coding": true, // allows newAction command and model can write/run code on your computer. enable at own risk
//         "code_timeout_mins": -1, // minutes code is allowed to run. -1 for no timeout
//     }
// )