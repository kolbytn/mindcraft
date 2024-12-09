import { History } from './history.js';
import { Coder } from './coder.js';
import { Prompter } from './prompter.js';
import { initModes } from './modes.js';
import { initBot } from '../utils/mcdata.js';
import { containsCommand, commandExists, executeCommand, truncCommandMessage, isAction } from './commands/index.js';
import { ActionManager } from './action_manager.js';
import { NPCContoller } from './npc/controller.js';
import { MemoryBank } from './memory_bank.js';
import { SelfPrompter } from './self_prompter.js';
import { isOtherAgent, initConversationManager, sendToBot, endAllChats, responseScheduledFor} from './conversation.js';
import { handleTranslation, handleEnglishTranslation } from '../utils/translator.js';
import { addViewer } from './viewer.js';
import settings from '../../settings.js';
import { serverProxy } from './server_proxy.js';
import { loadTask, TechTreeHarvestValidator } from '../utils/tasks.js';
import {getPosition} from './library/world.js'

export class Agent {
    async start(profile_fp, load_mem=false, init_message=null, count_id=0, task=null) {

        this.last_sender = null;
        try {
            if (!profile_fp) {
                throw new Error('No profile filepath provided');
            }

            // Connect to MindServer via proxy
            serverProxy.connect();
            
            console.log('Starting agent initialization with profile:', profile_fp);
            
            // Initialize components with more detailed error handling
            console.log('Initializing action manager...');
            this.actions = new ActionManager(this);
            console.log('Initializing prompter...');
            this.prompter = new Prompter(this, profile_fp);
            this.name = this.prompter.getName();
            console.log('Initializing history...');
            this.history = new History(this);
            console.log('Initializing coder...');
            this.coder = new Coder(this);
            console.log('Initializing npc controller...');
            this.npc = new NPCContoller(this);
            console.log('Initializing memory bank...');
            this.memory_bank = new MemoryBank();
            console.log('Initializing self prompter...');
            this.self_prompter = new SelfPrompter(this);
            initConversationManager(this);            
            console.log('Initializing examples...');
            await this.prompter.initExamples();

            serverProxy.registerAgent(this.name);

            console.log(this.name, 'logging into minecraft...');
            this.bot = initBot(this.name);

            initModes(this);

            let save_data = null;
            if (load_mem) {
                save_data = this.history.load();
            }

            if (task) {
                this.task = loadTask(task);
                this.taskTimeout = this.task.timeout || 300;
                this.taskStartTime = Date.now();
                if (this.task.type === 'harvest' || this.task.type === 'techtree') {
                    this.validator = new TechTreeHarvestValidator(this.task, this.bot);
                }
                this.validator = new TechTreeHarvestValidator(this.task, this.bot);
                
            } else {
                this.task = null;
                this.taskTimeout = null;
                this.validator = null;
            }

            // handle blocked actions
            if (this.task && "blocked_actions" in this.task) {
                if ("agent_number" in this.task && this.task.agent_number > 1) {
                    this.blocked_actions = this.task.blocked_actions[this.name];
                    console.log(`Blocked actions for ${this.name}:`, this.blocked_actions);
                } else {
                    this.blocked_actions = this.task.blocked_actions;
                    console.log(`Blocked actions:`, this.blocked_actions);
                }
            }
            
            console.log("Is validated:", this.validator && this.validator.validate());

            this.bot.on('login', () => {
                console.log(this.name, 'logged in!');
                
                // Set skin for profile, requires Fabric Tailor. (https://modrinth.com/mod/fabrictailor)
                if (this.prompter.profile.skin)
                    this.bot.chat(`/skin set URL ${this.prompter.profile.skin.model} ${this.prompter.profile.skin.path}`);
                else
                    this.bot.chat(`/skin clear`);
            });

            const spawnTimeout = setTimeout(() => {
                process.exit(0);
            }, 30000);
            
            this.bot.once('spawn', async () => {
                try {
                    clearTimeout(spawnTimeout);
                    addViewer(this.bot, count_id);

                    // wait for a bit so stats are not undefined
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                    
                    console.log(`${this.name} spawned.`);
                    this.clearBotLogs();
                    
                    if (this.task) {
                        this.bot.chat(`/clear ${this.name}`);
                        console.log(`Cleared ${this.name}'s inventory.`);
                    }
                    
                    //wait for a bit so inventory is cleared
                    await new Promise((resolve) => setTimeout(resolve, 500));

                    console.log(this.task && "agent_number" in this.task && this.task.agent_number > 1);
                    if (this.task && "agent_number" in this.task && this.task.agent_number > 1) {
                        var initial_inventory = this.task.initial_inventory[this.name];
                        console.log("Initial inventory:", initial_inventory);
                    } else if (task) {
                        console.log("Initial inventory:", this.task.initial_inventory);
                        var initial_inventory = this.task.initial_inventory;
                    }

                    if (this.task && "initial_inventory" in this.task) {
                        console.log("Setting inventory...");
                        console.log("Inventory to set:", initial_inventory);
                        for (let key of Object.keys(initial_inventory)) {
                            console.log('Giving item:', key);
                            this.bot.chat(`/give ${this.name} ${key} ${initial_inventory[key]}`);
                        };
                        //wait for a bit so inventory is set
                        await new Promise((resolve) => setTimeout(resolve, 500));
                        console.log("Done giving inventory items.");
                    }
                    // Function to generate random numbers
    
                    function getRandomOffset(range) {
                        return Math.floor(Math.random() * (range * 2 + 1)) - range;
                    }
    
                    let human_player_name = null;
    
                    // Finding if there is a human player on the server
                    for (const playerName in this.bot.players) {
                        const player = this.bot.players[playerName];
                        if (!isOtherAgent(player.username)) {
                            console.log('Found human player:', player.username);
                            human_player_name = player.username
                            break;
                        }
                        }
                    
                    // If there are multiple human players, teleport to the first one

                    // teleport near a human player if found by default

                    if (this.task && "agent_number" in this.task) {
                        var agent_names = this.task.agent_names;
                        if (human_player_name) {
                            console.log(`Teleporting ${this.name} to human ${human_player_name}`)
                            this.bot.chat(`/tp ${this.name} ${human_player_name}`) // teleport on top of the human player

                        }
                        else {
                            this.bot.chat(`/tp ${this.name} ${agent_names[0]}`) // teleport on top of the first agent
                        }
                        
                        await new Promise((resolve) => setTimeout(resolve, 200));
                    }

                    else if (this.task) {
                        if (human_player_name) {
                            console.log(`Teleporting ${this.name} to human ${human_player_name}`)
                            this.bot.chat(`/tp ${this.name} ${human_player_name}`) // teleport on top of the human player

                        }
                        await new Promise((resolve) => setTimeout(resolve, 200));
                    }

                    // now all bots are teleport on top of each other (which kinda looks ugly)
                    // Thus, we need to teleport them to random distances to make it look better

                    /*
                    Note : We don't want randomness for construction task as the reference point matters a lot.
                    Another reason for no randomness for construction task is because, often times the user would fly in the air,
                    then set a random block to dirt and teleport the bot to stand on that block for starting the construction,
                    This was done by MaxRobinson in one of the youtube videos.
                    */

                    if (this.task && this.task.type !== 'construction') {
                        const pos = getPosition(this.bot);
                        const xOffset = getRandomOffset(5);
                        const zOffset = getRandomOffset(5);
                        this.bot.chat(`/tp ${this.name} ${Math.floor(pos.x + xOffset)} ${pos.y + 3} ${Math.floor(pos.z + zOffset)}`);
                        await new Promise((resolve) => setTimeout(resolve, 200));
                    }
    

                    this._setupEventHandlers(save_data, init_message);
                    this.startEvents();

                    await new Promise((resolve) => setTimeout(resolve, 10000));
                    this.checkAllPlayersPresent();
                    
                } catch (error) {
                    console.error('Error in spawn event:', error);
                    process.exit(0);
                }
            });
        } catch (error) {
            // Ensure we're not losing error details
            console.error('Agent start failed with error:', {
                message: error.message || 'No error message',
                stack: error.stack || 'No stack trace',
                error: error
            });
            throw error; // Re-throw with preserved details
        }
    }

    async _setupEventHandlers(save_data, init_message) {
        const ignore_messages = [
            "Set own game mode to",
            "Set the time to",
            "Set the difficulty to",
            "Teleported ",
            "Set the weather to",
            "Gamerule "
        ];
        
        const respondFunc = async (username, message) => {
            if (username === this.name) return;
            try {
                if (ignore_messages.some((m) => message.startsWith(m))) return;

                this.shut_up = false;

                console.log(this.name, 'received message from', username, ':', message);

                if (isOtherAgent(username)) {
                    //recieveFromBot(username, message);
                    console.warn('recieved whisper from other bot??')
                }
                else {
                    let translation = await handleEnglishTranslation(message);
                    this.handleMessage(username, translation);
                }
            } catch (error) {
                console.error('Error handling message:', error);
            }
        }

        this.bot.on('whisper', respondFunc);
        if (settings.profiles.length === 1)
            this.bot.on('chat', respondFunc);

        // Set up auto-eat
        this.bot.autoEat.options = {
            priority: 'foodPoints',
            startAt: 14,
            bannedFood: ["rotten_flesh", "spider_eye", "poisonous_potato", "pufferfish", "chicken"]
        };

        if (save_data?.self_prompt) {
            let prompt = save_data.self_prompt;
            // add initial message to history
            this.history.add('system', prompt);
            await this.self_prompter.start(prompt);
        }
        else if (save_data?.last_sender) {
            this.last_sender = save_data.last_sender;
            await this.handleMessage('system', `You have restarted and this message is auto-generated. Continue the conversation with ${this.last_sender}`);
        }
        else if (init_message) {
            await this.handleMessage('system', init_message, 2);
        }
        else {
            const translation = await handleTranslation("Hello world! I am "+this.name);
            this.bot.chat(translation);
        }
    }

    checkAllPlayersPresent() {
        if (!this.task || !this.task.agent_names) {
          return;
        }

        const missingPlayers = this.task.agent_names.filter(name => !this.bot.players[name]);
        if (missingPlayers.length > 0) {
            console.log(`Missing players/bots: ${missingPlayers.join(', ')}`);
            this.cleanKill('Not all required players/bots are present in the world. Exiting.', 4);
          }
        }

    requestInterrupt() {
        this.bot.interrupt_code = true;
        this.bot.collectBlock.cancelTask();
        this.bot.pathfinder.stop();
        this.bot.pvp.stop();
    }

    clearBotLogs() {
        this.bot.output = '';
        this.bot.interrupt_code = false;
    }

    shutUp() {
        this.shut_up = true;
        if (this.self_prompter.on) {
            this.self_prompter.stop(false);
        }
        endAllChats();
    }

    async handleMessage(source, message, max_responses=null) {
        if (this.task && this.validator && this.validator.validate()) {
            this.killBots();
        }
        if (!source || !message) {
            console.warn('Received empty message from', source);
            return false;
        }

        let used_command = false;
        if (max_responses === null) {
            max_responses = settings.max_commands === -1 ? Infinity : settings.max_commands;
        }
        if (max_responses === -1){
            max_responses = Infinity;
        }

        const self_prompt = source === 'system' || source === this.name;
        const from_other_bot = isOtherAgent(source);

        if (!self_prompt && !from_other_bot) { // from user, check for forced commands
            const user_command_name = containsCommand(message);
            if (user_command_name) {
                if (!commandExists(user_command_name)) {
                    this.bot.chat(`Command '${user_command_name}' does not exist.`);
                    return false;
                }
                this.bot.chat(`*${source} used ${user_command_name.substring(1)}*`);
                if (user_command_name === '!newAction') {
                    // all user-initiated commands are ignored by the bot except for this one
                    // add the preceding message to the history to give context for newAction
                    this.history.add(source, message);
                }
                let execute_res = await executeCommand(this, message);
                if (execute_res) 
                    this.routeResponse(source, execute_res);
                return true;
            }
        } else {
            console.log('Self-prompting:', message);
            // if self_prompt contains something that indicates the goal is complete, stop self-prompting
            if (message.includes('goal complete')) {
                this.self_prompter.stop();
                process.exit(0);
            }
        }

        if (!self_prompt)
            this.last_sender = source;

        // Now translate the message
        message = await handleEnglishTranslation(message);
        console.log('received message from', source, ':', message);

        const checkInterrupt = () => this.self_prompter.shouldInterrupt(self_prompt) || this.shut_up || responseScheduledFor(source);

        let behavior_log = this.bot.modes.flushBehaviorLog();
        if (behavior_log.trim().length > 0) {
            const MAX_LOG = 500;
            if (behavior_log.length > MAX_LOG) {
                behavior_log = '...' + behavior_log.substring(behavior_log.length - MAX_LOG);
            }
            behavior_log = 'Recent behaviors log: \n' + behavior_log.substring(behavior_log.indexOf('\n'));
            await this.history.add('system', behavior_log);
        }

        // Handle other user messages
        await this.history.add(source, message);
        this.history.save();


        if (!self_prompt && this.self_prompter.on) // message is from user during self-prompting
            max_responses = 1; // force only respond to this message, then let self-prompting take over
        for (let i=0; i<max_responses; i++) {

            
            if (checkInterrupt()) break;
            let history = this.history.getHistory();
            let res = await this.prompter.promptConvo(history);

            let command_name = containsCommand(res);

            if (command_name) { // contains query or command
                console.log(`Full response: ""${res}""`)
                res = truncCommandMessage(res); // everything after the command is ignored
                this.history.add(this.name, res);
                
                if (!commandExists(command_name)) {
                    this.history.add('system', `Command ${command_name} does not exist.`);
                    console.warn('Agent hallucinated command:', command_name)
                    continue;
                }

                if (checkInterrupt()) break;
                this.self_prompter.handleUserPromptedCmd(self_prompt, isAction(command_name));

                if (settings.verbose_commands) {
                    this.routeResponse(source, res, res.indexOf(command_name));
                }
                else { // only output command name
                    let pre_message = res.substring(0, res.indexOf(command_name)).trim();
                    let chat_message = `*used ${command_name.substring(1)}*`;
                    if (pre_message.length > 0)
                        chat_message = `${pre_message}  ${chat_message}`;
                    this.routeResponse(source, chat_message);
                }

                let execute_res = await executeCommand(this, res);

                console.log('Agent executed:', command_name, 'and got:', execute_res);
                used_command = true;

                if (execute_res)
                    this.history.add('system', execute_res);
                else
                    break;
            }
            else { // conversation response
                this.history.add(this.name, res);
                this.routeResponse(source, res);
                console.log('Purely conversational response:', res);
                break;
            }
            
            this.history.save();
        }

        return used_command;
    }

    async routeResponse(to_player, message, translate_up_to=-1) {
        let self_prompt = to_player === 'system' || to_player === this.name;
        if (self_prompt && this.last_sender && !this.self_prompter.on) {
            // this is for when the agent is prompted by system while still in conversation
            // so it can respond to events like death but be routed back to the last sender
            to_player = this.last_sender;
        }

        if (isOtherAgent(to_player)) {
            sendToBot(to_player, message);
            return;
        }

        let to_translate = message;
        let remaining = '';
        if (translate_up_to != -1) {
            to_translate = to_translate.substring(0, translate_up_to);
            remaining = message.substring(translate_up_to);
        }
        message = (await handleTranslation(to_translate)).trim() + " " + remaining;
        // newlines are interpreted as separate chats, which triggers spam filters. replace them with spaces
        message = message.replaceAll('\n', ' ');

        if (self_prompt) 
            this.bot.chat(message);
        else
            this.bot.whisper(to_player, message);
    }

    async startEvents() {
        // Custom events
        // this.bot.on('spawn', () => {
            
        //     //check that inventory has been set
        // });


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

        let prev_health = this.bot.health;
        this.bot.lastDamageTime = 0;
        this.bot.lastDamageTaken = 0;
        this.bot.on('health', () => {
            if (this.bot.health < prev_health) {
                this.bot.lastDamageTime = Date.now();
                this.bot.lastDamageTaken = prev_health - this.bot.health;
            }
            prev_health = this.bot.health;
        });
        // Logging callbacks
        this.bot.on('error' , (err) => {
            console.error('Error event!', err);
        });
        this.bot.on('end', (reason) => {
            console.warn('Bot disconnected! Killing agent process.', reason)
            this.cleanKill('Bot disconnected! Killing agent process.');
        });
        this.bot.on('death', () => {
            this.actions.cancelResume();
            this.actions.stop();
        });
        this.bot.on('kicked', (reason) => {
            console.warn('Bot kicked!', reason);
            this.cleanKill('Bot kicked! Killing agent process.');
        });
        this.bot.on('messagestr', async (message, _, jsonMsg) => {
            if (jsonMsg.translate && jsonMsg.translate.startsWith('death') && message.startsWith(this.name)) {
                console.log('Agent died: ', message);
                let death_pos = this.bot.entity.position;
                this.memory_bank.rememberPlace('last_death_position', death_pos.x, death_pos.y, death_pos.z);
                let death_pos_text = null;
                if (death_pos) {
                    death_pos_text = `x: ${death_pos.x.toFixed(2)}, y: ${death_pos.y.toFixed(2)}, z: ${death_pos.x.toFixed(2)}`;
                }
                let dimention = this.bot.game.dimension;
                this.handleMessage('system', `You died at position ${death_pos_text || "unknown"} in the ${dimention} dimension with the final message: '${message}'. Your place of death is saved as 'last_death_position' if you want to return. Previous actions were stopped and you have respawned.`);
            }
        });
        this.bot.on('idle', () => {
            if (this.task && this.validator && this.validator.validate()) {
                this.killBots();
            }
            this.bot.clearControlStates();
            this.bot.pathfinder.stop(); // clear any lingering pathfinder
            this.bot.modes.unPauseAll();
            this.actions.resumeAction();
        });

        // Init NPC controller
        this.npc.init();

        // This update loop ensures that each update() is called one at a time, even if it takes longer than the interval
        const INTERVAL = 300;
        let last = Date.now();
        setTimeout(async () => {
            while (true) {
                let start = Date.now();
                await this.update(start - last);
                let remaining = INTERVAL - (Date.now() - start);
                if (remaining > 0) {
                    await new Promise((resolve) => setTimeout(resolve, remaining));
                }
                last = start;
            }
        }, INTERVAL);

        this.bot.emit('idle');
    }

    async killBots() {
        this.bot.chat('Task completed!');
        this.bot.chat(`/clear @p`);

        // Kick other bots
        if (!this.task || !this.task.agent_number) {
            await this.cleanKill('Task completed', 2);
            return;
        }
        const agent_names = this.task.agent_names;
        console.log('All agent names:', agent_names);
        console.log('My name:', this.name);
        const botNames = agent_names.filter(botName => botName !== this.name);
        console.log('Kicking bots:', botNames);
        botNames.forEach(botName => {
            this.bot.chat(`/kick ${botName}`);
            console.log(`/kick ${botName}`);

        });

        await this.cleanKill('Task completed, exiting', 2);
    }

    async update(delta) {
        await this.bot.modes.update();
        await this.self_prompter.update(delta);

        try {
            if (this.task && this.taskTimeout) {
                const elapsedTime = (Date.now() - this.taskStartTime) / 1000;
                if (elapsedTime >= this.taskTimeout) {
                  console.log('Task timeout reached. Task unsuccessful.');
                  await this.cleanKill('Task unsuccessful: Timeout reached', 3);
                }
            }
            } catch (e) {
                console.error("Caught an error while checking timeout reached",e);
            }
    }

    isIdle() {
        return !this.actions.executing && !this.coder.generating;
    }
    
    cleanKill(msg='Killing agent process...', 
            code=1) {
        this.history.add('system', msg);

        if (code === 2 || code === 3 || code === 4) {
            this.bot.chat('Exiting the world permanently.');
        }
        else {
            this.bot.chat('Restarting.')
        }
        this.history.save();
        process.exit(code);
    }
}
