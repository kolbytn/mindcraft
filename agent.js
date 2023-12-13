import { initBot } from './utils/mcdata.js';
import { sendRequest } from './utils/gpt.js';
import { History } from './utils/history.js';
import { Coder } from './utils/coder.js';
import { getQuery, containsQuery } from './utils/queries.js';
import { containsCodeBlock } from './utils/skill-library.js';
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
    
                this.history.add(username, message);
                this.handleMessage();
            });

            if (init_message) {
                this.history.add('system', init_message);
                this.handleMessage();
            } else {
                this.bot.emit('finished_executing');
            }
        });
    }

    async executeCode(code, triesRemaining=5) {
        if (code == 'default')
            code = this.history.default;

        if (code) {
            this.coder.queueCode(code);
            let code_return = await this.coder.execute();
            let message = code_return.message;
            if (code_return.interrupted)
                return;
            if (!code_return.success)
                message += "\n Write code to fix the problem and try again.";
            console.log('code return:', message);
            this.history.add('system', message);
            if (!code_return.success)
                await this.handleMessage(triesRemaining-1);
        }
    }

    async handleMessage(triesRemaining=5) {
        if (triesRemaining == 0) {
            console.log('Quitting response loop.');
            return;
        }

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
            await this.handleMessage(triesRemaining-1);
        }
        else if (containsCodeBlock(res)) { // contains code block
            console.log('Agent is executing code:', res)

            let message = res.substring(0, res.indexOf('```')).trim();
            if (message) 
                this.bot.chat(message);
            let code = res.substring(res.indexOf('```')+3, res.lastIndexOf('```'));
            await this.executeCode(code, triesRemaining);
        }
        else { // conversation response
            this.bot.chat(res);
            console.log('Purely conversational response:', res)
        }
        this.history.save();
    }
}
