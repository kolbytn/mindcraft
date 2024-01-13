import { initBot } from '../utils/mcdata.js';
import { sendRequest } from '../utils/gpt.js';
import { History } from './history.js';
import { Coder } from './coder.js';
import { containsCommand, executeCommand } from './commands.js';
import { Events } from './events.js';


export class Agent {
    constructor(name, profile=null, init_message=null) {
        this.name = name;
        this.bot = initBot(name);
        this.history = new History(this);
        this.coder = new Coder(this);

        this.history.load(profile);

        this.events = new Events(this, this.history.events)

        this.bot.on('login', async () => {
            await this.history.loadExamples();

            if (!init_message)
                this.bot.chat('Hello world! I am ' + this.name);
            console.log(`${this.name} logged in.`);
            
            const ignore_messages = [
                "Set own game mode to",
                "Set the time to",
                "Set the difficulty to",
                "Teleported ",
                "Set the weather to",
                "Gamerule "
            ];
            this.bot.on('chat', (username, message) => {
                if (username === this.name) return;
                
                if (ignore_messages.some((m) => message.startsWith(m))) return;

                console.log('received message from', username, ':', message);
    
                this.handleMessage(username, message);
            });


            if (init_message) {
                this.handleMessage('system', init_message);
            } else {
                this.bot.emit('finished_executing');
            }
        });
    }

    async handleMessage(source, message) {
        if (!!source && !!message)
            await this.history.add(source, message);

        const user_command_name = containsCommand(message);
        if (user_command_name) {
            this.bot.chat(`*${source} used ${user_command_name.substring(1)}*`);
            let execute_res = await executeCommand(this, message);
            if (user_command_name === '!newAction') {
                // all user initiated commands are ignored by the bot except for this one
                // add the preceding message to the history to give context for newAction
                let truncated_msg = message.substring(0, message.indexOf(user_command_name)).trim();
                this.history.add(source, truncated_msg);
            }
            if (execute_res)
                this.bot.chat(execute_res);
            return;
        }

        for (let i=0; i<5; i++) {
            let res = await sendRequest(this.history.getHistory(), this.history.getSystemMessage());
            this.history.add(this.name, res);

            let command_name = containsCommand(res);

            if (command_name) { // contains query or command
                console.log('Query/Command response:', res);

                let pre_message = res.substring(0, res.indexOf(command_name)).trim();

                this.bot.chat(`${pre_message}  *used ${command_name.substring(1)}*`);
                let execute_res = await executeCommand(this, res);

                console.log('Agent executed:', command_name, 'and got:', execute_res);

                if (execute_res)
                    this.history.add('system', execute_res);
                else
                    break;
            }
            else { // conversation response
                this.bot.chat(res);
                console.log('Purely conversational response:', res);
                break;
            }
        }

        this.history.save();
        this.bot.emit('finished_executing');
    }
}
