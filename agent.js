import { initBot } from './utils/mcdata.js';
import { sendRequest } from './utils/gpt.js';
import { History } from './utils/history.js';
import { Coder } from './utils/coder.js';
import { getQuery, containsQuery } from './utils/queries.js';
import { containsCodeBlock } from './utils/skill-library.js';


export class Agent {
    constructor(name, save_path, clear_memory=false, autostart=false) {
        this.name = name;
        this.bot = initBot(name);
        this.history = new History(this, save_path);
        this.history.loadExamples();
        this.coder = new Coder(this);

        if (!clear_memory) {
            this.history.load();
        }

        this.bot.on('login', () => {
            this.bot.chat('Hello world! I am ' + this.name);
            console.log(`${this.name} logged in.`);

            this.bot.on('chat', (username, message) => {
                if (username === this.name) return;
                console.log('received message from', username, ':', message);
    
                this.respond(username, message);
                this.history.save();
            });
    
            this.bot.on('finished_executing', () => {
                setTimeout(() => {
                    if (!this.coder.executing) {
                        // return to default behavior
                    }
                }, 10000);
            });

            if (autostart)
                this.respond('system', 'Agent process restarted. Notify the user and decide what to do.');
            
        });
    }

    async respond(username, message) {
        await this.history.add(username, message);
        for (let i=0; i<5; i++) {
            let res = await sendRequest(this.history.getHistory(), this.history.getSystemMessage());
            this.history.add(this.name, res);
            let query_cmd = containsQuery(res);
            if (query_cmd) { // contains query
                let message = res.substring(0, res.indexOf(query_cmd)).trim();
                if (message) 
                    this.bot.chat(message);
                let query = getQuery(query_cmd);
                let query_res = query.perform(this);
                console.log('Agent used query:', query_cmd, 'and got:', query_res)
                this.history.add('system', query_res);
            }
            else if (containsCodeBlock(res)) { // contains code block
                console.log('Agent is executing code:', res)

                let message = res.substring(0, res.indexOf('```')).trim();
                if (message) 
                    this.bot.chat(message);
                let code = res.substring(res.indexOf('```')+3, res.lastIndexOf('```'));
                if (code) {
                    this.coder.queueCode(code);
                    let code_return = await this.coder.execute();
                    let message = code_return.message;
                    if (code_return.interrupted && !code_return.timedout)
                        break; // when interupted but not timed out, we were interupted by another conversation. end this one.
                    if (!code_return.success) {
                        message += "\nWrite code to fix the problem and try again.";
                    }
                    console.log('code return:', message);
                    this.history.add('system', message);
                }
            }
            else { // conversation response
                this.bot.chat(res);
                console.log('Purely conversational response:', res)
                break;
            }
        }
    }
}
