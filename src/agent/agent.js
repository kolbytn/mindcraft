import fs from 'fs';
import path from 'path';
import * as logger from '../../logger.js';
import { History } from './history.js';
import { Coder } from './coder.js';
import { VisionInterpreter } from './vision/vision_interpreter.js';
import { Prompter } from '../models/prompter.js';
import { initModes } from './modes.js';
import { initBot } from '../utils/mcdata.js';
import { containsCommand, commandExists, executeCommand, truncCommandMessage, isAction, blacklistCommands } from './commands/index.js';
import { ActionManager } from './action_manager.js';
import { NPCContoller } from './npc/controller.js';
import { MemoryBank } from './memory_bank.js';
import { SelfPrompter } from './self_prompter.js';
import convoManager from './conversation.js';
import { handleTranslation, handleEnglishTranslation } from '../utils/translator.js';
import { addBrowserViewer } from './vision/browser_viewer.js';
import settings from '../../settings.js';
import { serverProxy } from './agent_proxy.js';
import { Task } from './tasks/tasks.js';
import { say } from './speak.js';

export class Agent {
    async start(profile_fp, load_mem=false, init_message=null, count_id=0, task_path=null, task_id=null) {
        this.last_sender = null;
        // Safely attach agent instance to a global-like object so STT code can access it.
        // This works in Node.js ESM or CommonJS. If "global" doesn't exist, fallback to "globalThis".
        const globalObj = (typeof global !== 'undefined') ? global : globalThis;
        try {
            globalObj.agent = this;
        } catch(e) {
            console.warn("Failed attaching agent to global object:", e);
        }
        
        this.latestScreenshotPath = null;
        this.count_id = count_id;
        if (!profile_fp) {
            throw new Error('No profile filepath provided');
        }
        
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
        convoManager.initAgent(this);
        console.log('Initializing examples...');
        await this.prompter.initExamples();
        console.log('Initializing task...');

        // load mem first before doing task
        let save_data = null;
        if (load_mem) {
            save_data = this.history.load();
        }
        let taskStart = null;
        if (save_data) {
            taskStart = save_data.taskStart;
        } else {
            taskStart = Date.now();
        }
        this.task = new Task(this, task_path, task_id, taskStart);
        this.blocked_actions = settings.blocked_actions.concat(this.task.blocked_actions || []);
        blacklistCommands(this.blocked_actions);

        serverProxy.connect(this);

        console.log(this.name, 'logging into minecraft...');
        this.bot = initBot(this.name);

        initModes(this);

        

        this.bot.on('login', () => {
            console.log(this.name, 'logged in!');
            serverProxy.login();
            
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
                addBrowserViewer(this.bot, count_id);

                // wait for a bit so stats are not undefined
                await new Promise((resolve) => setTimeout(resolve, 1000));
                
                console.log(`${this.name} spawned.`);
                this.clearBotLogs();
              
                this._setupEventHandlers(save_data, init_message);
                this.startEvents();
              
                if (!load_mem) {
                    if (task_path !== null) {
                        this.task.initBotTask();
                        this.task.setAgentGoal();
                    }
                } else {
                    // set the goal without initializing the rest of the task
                    if (task_path !== null) {
                        this.task.setAgentGoal();
                    }
                }

                await new Promise((resolve) => setTimeout(resolve, 10000));
                this.checkAllPlayersPresent();
              
                console.log('Initializing vision intepreter...');
                this.vision_interpreter = new VisionInterpreter(this, settings.vision_mode);

            } catch (error) {
                console.error('Error in spawn event:', error);
                process.exit(0);
            }
        });
    }

    /**
     * Formats conversation history into a JSON string suitable for vision model logs.
     * This function replicates formatting logic that would ideally be centralized in `logger.js`.
     * It's placed in `agent.js` as a workaround due to previous difficulties in directly
     * modifying `logger.js` to ensure consistent vision log formatting.
     * @param {Array<Object>} conversationHistory - The conversation history array.
     * @returns {string} A JSON string representing the formatted history.
     */
    formatHistoryForVisionLog(conversationHistory) {
        if (!conversationHistory || conversationHistory.length === 0) return '';

        const formattedHistory = [];

        for (const turn of conversationHistory) {
            const formattedTurn = {
                role: turn.role || 'user', // Default to 'user' if role is missing
                content: []
            };

            if (typeof turn.content === 'string') {
                formattedTurn.content.push({
                    type: 'text',
                    text: turn.content
                });
            } else if (Array.isArray(turn.content)) {
                // Process array content to ensure it matches the expected structure
                turn.content.forEach(contentItem => {
                    if (typeof contentItem === 'string') { // Handle case where array contains simple strings
                        formattedTurn.content.push({ type: 'text', text: contentItem });
                    } else if (contentItem.type === 'text' && contentItem.text) {
                        formattedTurn.content.push({ type: 'text', text: contentItem.text });
                    } else if (contentItem.type === 'image_url' && contentItem.image_url && contentItem.image_url.url) {
                        // Adapt image_url structure if needed, or keep as is if logger handles it
                        formattedTurn.content.push({ type: 'image', image: contentItem.image_url.url });
                    } else if (contentItem.type === 'image' && contentItem.image) {
                         formattedTurn.content.push({ type: 'image', image: contentItem.image });
                    }
                    // Add more specific handlers if other content types are expected
                });
            } else if (turn.content && typeof turn.content === 'object') {
                // Handle simple object content (e.g., { text: '...', image: '...' })
                if (turn.content.text) {
                    formattedTurn.content.push({
                        type: 'text',
                        text: turn.content.text
                    });
                }
                if (turn.content.image) { // Assuming image is a string path or base64
                    formattedTurn.content.push({
                        type: 'image',
                        image: turn.content.image
                    });
                }
                 // If there's an image_url object within the content object
                if (turn.content.image_url && turn.content.image_url.url) {
                    formattedTurn.content.push({
                        type: 'image', // Standardize to 'image' type for logger
                        image: turn.content.image_url.url
                    });
                }
            }

            // Ensure content is always an array and not empty if there was original content
            if (turn.content && formattedTurn.content.length === 0) {
                // If original content existed but wasn't processed, stringify it as a fallback
                formattedTurn.content.push({ type: 'text', text: JSON.stringify(turn.content) });
            }

            formattedHistory.push(formattedTurn);
        }

        return JSON.stringify(formattedHistory);
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
            if (settings.only_chat_with.length > 0 && !settings.only_chat_with.includes(username)) return;
            try {
                if (ignore_messages.some((m) => message.startsWith(m))) return;

                this.shut_up = false;

                console.log(this.name, 'received message from', username, ':', message);

                if (convoManager.isOtherAgent(username)) {
                    console.warn('received whisper from other bot??')
                }
                else {
                    let translation = await handleEnglishTranslation(message);
                    this.handleMessage(username, translation);
                }
            } catch (error) {
                console.error('Error handling message:', error);
            }
        }

		this.respondFunc = respondFunc;

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
            if (init_message) {
                // Assuming init_message for self_prompt loading doesn't have an image
                await this.history.add('system', init_message, null);
            }
            await this.self_prompter.handleLoad(save_data.self_prompt, save_data.self_prompting_state);
        }
        if (save_data?.last_sender) {
            this.last_sender = save_data.last_sender;
            if (convoManager.otherAgentInGame(this.last_sender)) {
                const msg_package = {
                    message: `You have restarted and this message is auto-generated. Continue the conversation with me.`,
                    start: true
                };
                convoManager.receiveFromBot(this.last_sender, msg_package);
            }
        }
        else if (init_message) {
            await this.handleMessage('system', init_message, 2);
        }
        else {
            this.openChat("Hello world! I am "+this.name);
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
        this.bot.stopDigging();
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
        if (this.self_prompter.isActive()) {
            this.self_prompter.stop(false);
        }
        convoManager.endAllConversations();
    }

    async handleMessage(source, message, max_responses=null) {
        await this.checkTaskDone();
        if (!source || !message) {
            console.warn('Received empty message from', source);
            return false;
        }

        let used_command = false;
        if (max_responses === null) {
            max_responses = settings.max_commands === -1 ? Infinity : settings.max_commands;
        }
        if (max_responses === -1) {
            max_responses = Infinity;
        }

        const self_prompt = source === 'system' || source === this.name;
        const from_other_bot = convoManager.isOtherAgent(source);

        // This block handles capturing and logging images when vision_mode is 'always'.
        // It's processed early for any user message to ensure the visual context is captured
        // before the message itself is processed further down.
        if (!self_prompt && !from_other_bot) { // from user, check for forced commands
            if (settings.vision_mode === 'always' && this.vision_interpreter && this.vision_interpreter.camera) {
                try {
                    const screenshotFilename = await this.vision_interpreter.camera.capture();
                    // latestScreenshotPath stores the filename (e.g., "vision_timestamp_rand.jpg")
                    // It will be used by logger.logVision and potentially by history.add if the current message
                    // needs this image associated with it.
                    this.latestScreenshotPath = screenshotFilename;
                    console.log(`[${this.name}] Captured screenshot in always_active mode: ${screenshotFilename}`);

                    const currentHistory = this.history.getHistory(); // Get current history for the log.

                    let imageBuffer = null;
                    if (this.latestScreenshotPath && this.vision_interpreter.fp) { // fp is the base folder path for vision files.
                        try {
                            const fullImagePath = path.join(this.vision_interpreter.fp, this.latestScreenshotPath);
                            imageBuffer = fs.readFileSync(fullImagePath);
                        } catch (err) {
                            console.error(`[${this.name}] Error reading image for always active log: ${err.message}`);
                        }
                    }

                    if (imageBuffer) {
                        // Format the history using the agent's local helper function.
                        const formattedHistoryString = this.formatHistoryForVisionLog(currentHistory);
                        // Call logger.logVision:
                        // 1st arg (currentHistory): The raw history object. logger.js's logVision also calls its
                        //   own internal formatter on this if the 4th arg is not provided or if its internal logic dictates.
                        //   However, our goal is to use formattedHistoryString.
                        // 2nd arg (imageBuffer): The image data.
                        // 3rd arg ("Image captured..."): A placeholder response/description for this vision log entry.
                        // 4th arg (formattedHistoryString): This is the crucial part for the workaround.
                        //   By providing this, logger.js's logVision (as per its modified behavior in a previous subtask)
                        //   should use this pre-formatted string as the 'text' field in the metadata log.
                        logger.logVision(currentHistory, imageBuffer, "Image captured for always active vision", formattedHistoryString);
                        // Note: this.latestScreenshotPath is NOT consumed (set to null) here.
                        // This allows the same screenshot to be potentially associated with the user's message
                        // in the main history log if that message immediately follows this capture.
                    }

                } catch (error) {
                    console.error(`[${this.name}] Error capturing or logging screenshot in always_active mode:`, error);
                }
            }
            const user_command_name = containsCommand(message);
            if (user_command_name) {
                if (!commandExists(user_command_name)) {
                    this.routeResponse(source, `Command '${user_command_name}' does not exist.`);
                    return false;
                }
                this.routeResponse(source, `*${source} used ${user_command_name.substring(1)}*`);
                if (user_command_name === '!newAction') {
                    let imagePathForNewActionCmd = null;
                    // If an 'always active' screenshot was just taken and should be associated
                    // specifically with this !newAction command in the history, we could use this.latestScreenshotPath.
                    // However, the primary 'always active' log is already created above.
                    // For !newAction, it's more about the textual command context.
                    // If this.latestScreenshotPath is non-null here, it means an 'always' image was taken.
                    // We might choose to associate it or not, depending on desired behavior.
                    // For now, let's assume !newAction itself doesn't add another image to history unless specifically designed to.
                    // If an 'always' image was taken, it's already logged with its own context.
                    // If we wanted to associate it here too: imagePathForNewActionCmd = this.latestScreenshotPath;
                    await this.history.add(source, message, imagePathForNewActionCmd);
                    // if (imagePathForNewActionCmd) this.latestScreenshotPath = null; // Consume if used here.
                }
                let execute_res = await executeCommand(this, message);
                if (execute_res) 
                    this.routeResponse(source, execute_res);
                return true;
            }
        }

        if (from_other_bot)
            this.last_sender = source;

        // Now translate the message
        message = await handleEnglishTranslation(message);
        console.log('received message from', source, ':', message);

        const checkInterrupt = () => this.self_prompter.shouldInterrupt(self_prompt) || this.shut_up || convoManager.responseScheduledFor(source);
        
        let behavior_log = this.bot.modes.flushBehaviorLog().trim();
        if (behavior_log.length > 0) {
            const MAX_LOG = 500;
            if (behavior_log.length > MAX_LOG) {
                behavior_log = '...' + behavior_log.substring(behavior_log.length - MAX_LOG);
            }
            behavior_log = 'Recent behaviors log: \\n' + behavior_log;
            await this.history.add('system', behavior_log, null); // Behavior log unlikely to have an image
        }

        // Handle other user messages (or initial system messages)
        let imagePathForInitialMessage = null;
        // If 'always' mode took a screenshot (this.latestScreenshotPath is set) AND this message is from a user,
        // associate that screenshot with this message in the history.
        if (!self_prompt && !from_other_bot && settings.vision_mode === 'always' && this.latestScreenshotPath) {
             imagePathForInitialMessage = this.latestScreenshotPath;
        }


        await this.history.add(source, message, imagePathForInitialMessage);
        if (imagePathForInitialMessage) {
            // The screenshot has now been associated with this specific user message in the history.
            // We consume it (set to null) so it's not accidentally reused for subsequent unrelated history entries.
            // The 'always active' log itself has already been created with this image.
            this.latestScreenshotPath = null;
        }
        this.history.save();

        if (!self_prompt && this.self_prompter.isActive()) // message is from user during self-prompting
            max_responses = 1; // force only respond to this message, then let self-prompting take over
        for (let i=0; i<max_responses; i++) {
            if (checkInterrupt()) break;
            let history_for_prompt = this.history.getHistory(); // get fresh history for each prompt turn
            let res = await this.prompter.promptConvo(history_for_prompt);

            console.log(`${this.name} full response to ${source}: ""${res}""`);

            if (res.trim().length === 0) {
                console.warn('no response')
                break; // empty response ends loop
            }

            let command_name = containsCommand(res);

            if (command_name) { // contains query or command
                res = truncCommandMessage(res); // everything after the command is ignored
                // Agent's own message stating the command it will execute
                await this.history.add(this.name, res, null);
                
                if (!commandExists(command_name)) {
                    // Agent hallucinated a command
                    await this.history.add('system', `Command ${command_name} does not exist.`, null);
                    console.warn('Agent hallucinated command:', command_name)
                    continue;
                }

                if (checkInterrupt()) break;
                this.self_prompter.handleUserPromptedCmd(self_prompt, isAction(command_name));

                if (settings.verbose_commands) {
                    this.routeResponse(source, res);
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

                if (execute_res) {
                    let imagePathForCommandResult = null;
                    // Vision commands might set this.latestScreenshotPath in VisionInterpreter
                    // (e.g., !lookAtPlayer, !captureFullView).
                    // If so, associate that image with the command's result in history.
                    if (command_name && (command_name === '!lookAtPlayer' || command_name === '!lookAtPosition' || command_name === '!captureFullView') && this.latestScreenshotPath) {
                        imagePathForCommandResult = this.latestScreenshotPath;
                    }
                    await this.history.add('system', execute_res, imagePathForCommandResult);
                    if (imagePathForCommandResult) {
                        this.latestScreenshotPath = null; // Consume the path
                    }
                }
                else { // command execution didn't return anything or failed in a way that implies loop break
                    break;
                }
            }
            else { // conversation response (no command)
                await this.history.add(this.name, res, null); // Agent's text response, no image typically
                this.routeResponse(source, res);
                break;
            }
            
            this.history.save();
        }

        return used_command;
    }

    async routeResponse(to_player, message) {
        if (this.shut_up) return;
        let self_prompt = to_player === 'system' || to_player === this.name;
        if (self_prompt && this.last_sender) {
            // this is for when the agent is prompted by system while still in conversation
            // so it can respond to events like death but be routed back to the last sender
            to_player = this.last_sender;
        }

        if (convoManager.isOtherAgent(to_player) && convoManager.inConversation(to_player)) {
            // if we're in an ongoing conversation with the other bot, send the response to it
            convoManager.sendToBot(to_player, message);
        }
        else {
            // otherwise, use open chat
            this.openChat(message);
            // note that to_player could be another bot, but if we get here the conversation has ended
        }
    }

    async openChat(message) {
        let to_translate = message;
        let remaining = '';
        let command_name = containsCommand(message);
        let translate_up_to = command_name ? message.indexOf(command_name) : -1;
        if (translate_up_to != -1) { // don't translate the command
            to_translate = to_translate.substring(0, translate_up_to);
            remaining = message.substring(translate_up_to);
        }
        message = (await handleTranslation(to_translate)).trim() + " " + remaining;
        // newlines are interpreted as separate chats, which triggers spam filters. replace them with spaces
        message = message.replaceAll('\\n', ' ');

        if (settings.only_chat_with.length > 0) {
            for (let username of settings.only_chat_with) {
                this.bot.whisper(username, message);
            }
        }
        else {
	    if (settings.speak) {
            say(to_translate);
	    }
            this.bot.chat(message);
        }
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

    async update(delta) {
        await this.bot.modes.update();
        this.self_prompter.update(delta);
        await this.checkTaskDone();
    }

    isIdle() {
        return !this.actions.executing;
    }
    

    async cleanKill(msg='Killing agent process...', code=1) {
        // Assuming cleanKill messages don't have images
        if (this.history) { // Make sure history exists before trying to add to it
             await this.history.add('system', msg, null);
             this.history.save();
        } else {
            console.warn("[Agent] History not initialized, cannot save cleanKill message.")
        }
        if (this.bot) {
            this.bot.chat(code > 1 ? 'Restarting.': 'Exiting.');
        }
        process.exit(code);
    }
    async checkTaskDone() {
        if (this.task && this.task.data) { // Make sure task and task.data exist
            let res = this.task.isDone();
            if (res) {
                // Assuming task end messages don't have images
                if (this.history) {
                    await this.history.add('system', `Task ended with score : ${res.score}`, null);
                    await this.history.save();
                } else {
                     console.warn("[Agent] History not initialized, cannot save task end message.")
                }
                // await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 second for save to complete
                console.log('Task finished:', res.message);
                this.killAll();
            }
        }
    }

    killAll() {
        serverProxy.shutdown();
    }
}
