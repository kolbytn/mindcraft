import * as Mindcraft from './mindcraft.js';

await Mindcraft.init('localhost', 8080); // starts server locally
await Mindcraft.connect('ip', 'port') // connects to remote server
// ^ must do one of these before calling anything else

Mindcraft.addWorld(
    {
        name: 'test',
        minecraft_version: "1.21.1",
        host: 'localhost',
        port: 55916,
        auth: 'offline',

        render_bot_views: false, // show bot's view in browser at localhost:3000, 3001...
        allow_insecure_coding: true, // allows newAction command and model can write/run code on server. enable at own risk
        code_timeout_mins: -1, // minutes code is allowed to run. -1 for no timeout
        verbose_commands: true, // show full command syntax
        chat_bot_messages: true, // publicly chat bot-to-bot messages
    }
)
// add world for easy reuse. not super necessary, easy for user to copy world def object around. remove?


Mindcraft.addAgent(
    {
        world: 'test',
        world: {
            minecraft_version: '',
            host: '',
            port: '',
            auth: 'offline'
        },
        profile: './profiles/test.json',
        // profile: {
        //     name: 'test',
        //     prompt: 'test',
        // },
        task: './tasks/test.json'
    }
)

Mindcraft.removeAgent()