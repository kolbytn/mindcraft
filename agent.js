import { initBot } from './utils/mcdata.js';
import { sendRequest } from './utils/gpt.js';
import { History } from './utils/history.js';
import { Coder } from './utils/coder.js';
import { getQuery, containsQuery } from './utils/queries.js';
import { containsCodeBlock } from './utils/skill_library.js';


export class Agent {
    constructor(name, save_path, restart_memory=false) {
        this.name = name;
        this.bot = initBot(name);
        this.history = new History(this, save_path);
        this.coder = new Coder(this);

        if (!restart_memory) {
            this.history.load();
        }
        // Add the default behaviors and events
        else {
            this.history.default = `let blocks = world.getNearbyBlockTypes(bot, 4);
                let block_type = blocks[Math.floor(Math.random() * blocks.length)];
                await skills.collectBlock(bot, block_type);
                await new Promise(r => setTimeout(r, 1000));

                let players = world.getNearbyPlayerNames(bot);
                let player_name = players[Math.floor(Math.random() * players.length)];
                await skills.goToPlayer(bot, player_name);
                await new Promise(r => setTimeout(r, 1000));`;
            this.history.events.push(['finished_executing', this.executeCode, 'default']);
            // this.history.events.push(['finished_executing', this.sendThought, 'What should I do next? I will make a plan and execute it.']);
            this.history.events.push(['health', this.sendThought, 'I may be under attack or need to eat! I will stop what I am doing to check my health and take action.']);
            this.history.events.push(['sunrise', null, null]);
            this.history.events.push(['noon', null, null]);
            this.history.events.push(['sunset', null, null]);
            this.history.events.push(['midnight', null, null]);
        }

        this.bot.on('login', () => {
            this.bot.chat('Hello world! I am ' + this.name);
            console.log(`${this.name} logged in.`);
        });

        for (let [event, callback, params] of this.history.events) {
            if (callback != null)
                this.bot.on(event, callback.bind(this, params));
        }
    }

    async start() {
        await this.history.loadExamples();

        this.bot.on('chat', (username, message) => {
            if (username === this.name) return;
            console.log('received message from', username, ':', message);

            this.history.add(username, message);
            this.handleMessage();
        });

        this.bot.on('time', () => {
            if (this.bot.time.timeOfDay == 0)
                this.bot.emit('sunrise');
            else if (this.bot.time.timeOfDay == 6000)
                this.bot.emit('noon');
            else if (this.bot.time.timeOfDay == 12000)
                this.bot.emit('sunset');
            else if (this.bot.time.timeOfDay == 18000)
                this.bot.emit('midnight');
        });

        if (this.history.default) {
            this.executeCode(this.history.default);
        }
    }

    async sendThought(message) {
        this.history.add(this.name, message);
        await this.handleMessage();
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
