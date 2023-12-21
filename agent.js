import { initBot } from './utils/mcdata.js';
import { sendRequest } from './utils/gpt.js';
import { History } from './utils/history.js';
import { Coder } from './utils/coder.js';
import { getQuery, containsQuery } from './utils/queries.js';
import { getCommand, containsCommand } from './utils/commands.js';
import { Events } from './utils/events.js';


export class Agent {
    constructor(name, save_path, load_path=null, init_message=null) {
        this.name = name;
        this.bot = initBot(name);
        this.history = new History(this, save_path);
        this.history.loadExamples();
        this.coder = new Coder(this);

        if (load_path) {
            this.history.load(load_path);
        }

        this.events = new Events(this, this.history.events)

        this.bot.on('login', () => {
            this.bot.chat('Hello world! I am ' + this.name);
            console.log(`${this.name} logged in.`);

            this.bot.on('chat', (username, message) => {
                if (username === this.name) return;
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
        await this.history.add(source, message);

        for (let i=0; i<5; i++) {
            let res = await sendRequest(this.history.getHistory(), this.history.getSystemMessage());
            this.history.add(this.name, res);

            let query_name = containsQuery(res);
            let command_name = containsCommand(res);

            if (query_name || command_name) { // contains query or command
                console.log('Query/Command response:', res);

                let execute_name = query_name ? query_name : command_name;
                let message = res.substring(0, res.indexOf(execute_name)).trim();
                if (message)
                    this.bot.chat(message);

                let execute_func = query_name ? getQuery(query_name) : getCommand(command_name);
                let execute_res = await execute_func.perform(this);

                console.log('Agent executed:', execute_name, 'and got:', execute_res);

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
