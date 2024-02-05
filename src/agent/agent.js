import { History } from './history.js';
import { Coder } from './coder.js';
import { initModes } from './modes.js';
import { Examples } from '../utils/examples.js';
import { initBot } from '../utils/mcdata.js';
import { sendRequest } from '../utils/gpt.js';
import { containsCommand, commandExists, executeCommand } from './commands/index.js';


export class Agent {
    async start(name, profile=null, init_message=null) {
        this.name = name;
        this.examples = new Examples();
        this.history = new History(this);
        this.coder = new Coder(this);

        console.log('Loading examples...');

        this.history.load(profile);
        await this.examples.load('./src/examples.json');
        await this.coder.load();

        console.log('Logging in...');
        this.bot = initBot(name);

        initModes(this);

        this.bot.on('login', async () => {
            console.log(`${this.name} logged in.`);
            this.coder.clear();
            
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

            // set the bot to automatically eat food when hungry
            this.bot.autoEat.options = {
                priority: 'foodPoints',
                startAt: 14,
                bannedFood: ["rotten_flesh", "spider_eye", "poisonous_potato", "pufferfish", "chicken"]
            };

            if (init_message) {
                this.handleMessage('system', init_message);
            } else {
                this.bot.chat('Hello world! I am ' + this.name);
                this.bot.emit('finished_executing');
            }

            this.startEvents();
        });
    }

    cleanChat(message) {
        // newlines are interpreted as separate chats, which triggers spam filters. replace them with spaces
        message = message.replaceAll('\n', '  ');
        return this.bot.chat(message);
    }

    async handleMessage(source, message) {
        if (!!source && !!message)
            await this.history.add(source, message);

        const user_command_name = containsCommand(message);
        if (user_command_name) {
            if (!commandExists(user_command_name)) {
                this.bot.chat(`Command '${user_command_name}' does not exist.`);
                return;
            }
            this.bot.chat(`*${source} used ${user_command_name.substring(1)}*`);
            let execute_res = await executeCommand(this, message);
            if (user_command_name === '!newAction') {
                // all user initiated commands are ignored by the bot except for this one
                // add the preceding message to the history to give context for newAction
                let truncated_msg = message.substring(0, message.indexOf(user_command_name)).trim();
                this.history.add(source, truncated_msg);
            }
            if (execute_res) 
                this.cleanChat(execute_res);
            return;
        }

        for (let i=0; i<5; i++) {
            let history = await this.history.getHistory(this.examples);
            let res = await sendRequest(history, this.history.getSystemMessage());
            this.history.add(this.name, res);

            let command_name = containsCommand(res);

            if (command_name) { // contains query or command
                console.log('Command message:', res);
                if (!commandExists(command_name)) {
                    this.history.add('system', `Command ${command_name} does not exist. Use !newAction to perform custom actions.`);
                    console.log('Agent hallucinated command:', command_name)
                    continue;
                }

                let pre_message = res.substring(0, res.indexOf(command_name)).trim();

                this.cleanChat(`${pre_message}  *used ${command_name.substring(1)}*`);
                let execute_res = await executeCommand(this, res);

                console.log('Agent executed:', command_name, 'and got:', execute_res);

                if (execute_res)
                    this.history.add('system', execute_res);
                else
                    break;
            }
            else { // conversation response
                this.cleanChat(res);
                console.log('Purely conversational response:', res);
                break;
            }
        }

        this.history.save();
        this.bot.emit('finished_executing');
    }

    startEvents() {
        // Custom events
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
        this.bot.on('health', () => {
            if (this.bot.health < 20)
            this.bot.emit('damaged');
        });

        // Logging callbacks
        this.bot.on('error' , (err) => {
            console.error('Error event!', err);
        });
        this.bot.on('end', (reason) => {
            console.warn('Bot disconnected! Killing agent process.', reason)
            process.exit(1);
        });
        this.bot.on('death', () => {
            this.coder.stop();
        });
        this.bot.on('kicked', (reason) => {
            console.warn('Bot kicked!', reason);
            process.exit(1);
        });
        this.bot.on('messagestr', async (message, _, jsonMsg) => {
            if (jsonMsg.translate && jsonMsg.translate.startsWith('death') && message.startsWith(this.name)) {
                console.log('Agent died: ', message);
                this.handleMessage('system', `You died with the final message: '${message}'. Previous actions were stopped and you have respawned. Notify the user and perform any necessary actions.`);
            }
        });
        this.bot.on('idle', () => {
            this.bot.modes.unPauseAll();
            this.coder.executeResume();
        });

        // This update loop ensures that each update() is called one at a time, even if it takes longer than the interval
        const INTERVAL = 300;
        setTimeout(async () => {
            while (true) {
                let start = Date.now();
                await this.bot.modes.update();
                let remaining = INTERVAL - (Date.now() - start);
                if (remaining > 0) {
                    await new Promise((resolve) => setTimeout(resolve, remaining));
                }
            }
        }, INTERVAL);
    }

    isIdle() {
        return !this.coder.executing && !this.coder.generating;
    }
}
