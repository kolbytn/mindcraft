import { createBot } from 'mineflayer';
import { pathfinder } from 'mineflayer-pathfinder';
import { plugin } from 'mineflayer-collectblock';
import { sendRequest } from './utils/gpt.js';
import { History } from './utils/history.js';
import { getQuery, containsQuery, getQueryDocs } from './utils/queries.js';
import { getSkillDocs, containsCodeBlock, executeSkill } from './utils/skill_library.js';


export class Agent {
    constructor(name) {
        this.name = name;

        this.system_message = `You are a playful Minecraft bot named '${name}' that can communicate with players, see, move, mine, build, and interact with the world by writing and executing code.
        Act human-like as if you were a typical Minecraft player, rather than an AI. Be curt and brief in your responses, and do not give instructions unless asked.`;
        this.system_message += getQueryDocs();
        this.system_message += getSkillDocs();
        console.log(this.system_message);
        this.bot = createBot({
            host: 'localhost',
            port: 55916,
            username: name,
        });
        this.bot.loadPlugin(pathfinder)
        this.bot.loadPlugin(plugin)

        this.history = new History(this);
        this.bot.on('login', () => {
            this.bot.chat('Hello world! I am ' + this.name);
            console.log(`${this.name} logged in.`);
        });

        this.bot.on('chat', (username, message) => {
            if (username === this.name) return;
            console.log('received message from', username, ':', message);

            this.respond(username, message);
        });
    }

    async respond(username, message) {
        this.history.add(username, message);
        for (let i=0; i<5; i++) {
            let res = await sendRequest(this.history.getHistory(), this.system_message);
            this.history.add(this.name, res);
            let query_cmd = containsQuery(res);
            console.log(containsCodeBlock(res))
            if (query_cmd) { // contains query
                let message = res.substring(0, res.indexOf(query_cmd)).trim();
                if (message) 
                    this.bot.chat(message);
                console.log('Agent used query:', query_cmd);
                let query = getQuery(query_cmd);
                let query_res = query.perform(this.bot);
                this.history.add(this.name, query_res);
            }
            else if (containsCodeBlock(res)) { // contains code block
                let message = res.substring(0, res.indexOf('```')).trim();
                if (message) 
                    this.bot.chat(message);
                else
                    this.bot.chat("Executing code...");
                let code = res.substring(res.indexOf('```')+3, res.lastIndexOf('```'));
                if (code) {
                    console.log('executing code: ' + code);
                    executeSkill(this.bot, code);
                }
                break;
            }
            else { // conversation response
                this.bot.chat(res);
                break;
            }
        }
    }
}

new Agent('andy');
