import settings from '../../settings.js';
import { readFileSync } from 'fs';
import { containsCommand } from './commands/index.js';
import { sendBotChatToServer } from './agent_proxy.js';

let agent;
let agent_names = settings.profiles.map((p) => JSON.parse(readFileSync(p, 'utf8')).name);

let self_prompter_paused = false;

class Conversation {
    constructor(name) {
        this.name = name;
        this.active = false;
        this.ignore_until_start = false;
        this.blocked = false;
        this.in_queue = [];
        this.inMessageTimer = null;
    }

    reset() {
        this.active = false;
        this.ignore_until_start = false;
        this.in_queue = [];
        this.inMessageTimer = null;
    }

    end() {
        this.active = false;
        this.ignore_until_start = true;
        this.inMessageTimer = null;
        const full_message = _compileInMessages(this);
        if (full_message.message.trim().length > 0)
            agent.history.add(this.name, full_message.message);
        // add the full queued messages to history, but don't respond

        if (agent.last_sender === this.name)
            agent.last_sender = null;
    }

    queue(message) {
        this.in_queue.push(message);
    }
}


class ConversationManager {
    constructor() {
        this.convos = {};
        this.activeConversation = null;
    }

    initAgent(a) {
        agent = a;
    }

    _getConvo(name) {
        if (!this.convos[name])
            this.convos[name] = new Conversation(name);
        return this.convos[name];
    }

    async startConversation(send_to, message) {
        const convo = this._getConvo(send_to);
        convo.reset();
        
        if (agent.self_prompter.on) {
            await agent.self_prompter.stop();
            self_prompter_paused = true;
        }
        if (convo.active)
            return;
        convo.active = true;
        this.activeConversation = convo;
        this.sendToBot(send_to, message, true);
    }

    sendToBot(send_to, message, start=false) {
        if (!this.isOtherAgent(send_to)) {
            agent.bot.whisper(send_to, message);
            return;
        }
        const convo = this._getConvo(send_to);
        
        if (settings.chat_bot_messages && !start)
            agent.openChat(`(To ${send_to}) ${message}`);
        
        if (convo.ignore_until_start)
            return;
        convo.active = true;
        
        const end = message.includes('!endConversation');
        const json = {
            'message': message,
            start,
            end,
        };

        sendBotChatToServer(send_to, JSON.stringify(json));
    }

    async recieveFromBot(sender, json) {
        const convo = this._getConvo(sender);

        // check if any convo is active besides the sender
        if (Object.values(this.convos).some(c => c.active && c.name !== sender)) {
            this.sendToBot(sender, `I'm talking to someone else, try again later. !endConversation("${sender}")`);
            return;
        }
    
        const recieved = JSON.parse(json);
        if (recieved.start) {
            convo.reset();
        }
        if (convo.ignore_until_start)
            return;
    
        convo.queue(recieved);
        
        // responding to conversation takes priority over self prompting
        if (agent.self_prompter.on){
            await agent.self_prompter.stopLoop();
            self_prompter_paused = true;
        }
    
        _scheduleProcessInMessage(sender, recieved, convo);
    }

    responseScheduledFor(sender) {
        if (!this.isOtherAgent(sender) || !this.inConversation(sender))
            return false;
        const convo = this._getConvo(sender);
        return !!convo.inMessageTimer;
    }

    isOtherAgent(name) {
        return agent_names.some((n) => n === name);
    }
    
    updateAgents(agents) {
        agent_names = agents.map(a => a.name);
    }
    
    inConversation(other_agent=null) {
        if (other_agent)
            return this.convos[other_agent]?.active;
        return Object.values(this.convos).some(c => c.active);
    }
    
    endConversation(sender) {
        if (this.convos[sender]) {
            this.convos[sender].end();
            this.activeConversation = null;
            if (self_prompter_paused && !this.inConversation()) {
                _resumeSelfPrompter();
            }
        }
    }
    
    endAllConversations() {
        for (const sender in this.convos) {
            this.convos[sender].end();
        }
        if (self_prompter_paused) {
            _resumeSelfPrompter();
        }
    }
    
    scheduleSelfPrompter() {
        self_prompter_paused = true;
    }
    
    cancelSelfPrompter() {
        self_prompter_paused = false;
    }
}

const convoManager = new ConversationManager();
export default convoManager;

/*
This function controls conversation flow by deciding when the bot responds.
The logic is as follows:
- If neither bot is busy, respond quickly with a small delay.
- If only the other bot is busy, respond with a long delay to allow it to finish short actions (ex check inventory)
- If I'm busy but other bot isn't, let LLM decide whether to respond
- If both bots are busy, don't respond until someone is done, excluding a few actions that allow fast responses
- New messages recieved during the delay will reset the delay following this logic, and be queued to respond in bulk
*/
const talkOverActions = ['stay', 'followPlayer', 'mode:']; // all mode actions
const fastDelay = 200;
const longDelay = 5000;
async function _scheduleProcessInMessage(sender, recieved, convo) {
    if (convo.inMessageTimer)
        clearTimeout(convo.inMessageTimer);
    let otherAgentBusy = containsCommand(recieved.message);

    const scheduleResponse = (delay) => convo.inMessageTimer = setTimeout(() => _processInMessageQueue(sender), delay);

    if (!agent.isIdle() && otherAgentBusy) {
        // both are busy
        let canTalkOver = talkOverActions.some(a => agent.actions.currentActionLabel.includes(a));
        if (canTalkOver)
            scheduleResponse(fastDelay)
        // otherwise don't respond
    }
    else if (otherAgentBusy)
        // other bot is busy but I'm not
        scheduleResponse(longDelay);
    else if (!agent.isIdle()) {
        // I'm busy but other bot isn't
        let canTalkOver = talkOverActions.some(a => agent.actions.currentActionLabel.includes(a));
        if (canTalkOver) {
            scheduleResponse(fastDelay);
        }
        else {
            let shouldRespond = await agent.prompter.promptShouldRespondToBot(recieved.message);
            console.log(`${agent.name} decided to ${shouldRespond?'respond':'not respond'} to ${sender}`);
            if (shouldRespond)
                scheduleResponse(fastDelay);
        }
    }
    else {
        // neither are busy
        scheduleResponse(fastDelay);
    }
}

function _processInMessageQueue(name) {
    const convo = convoManager._getConvo(name);
    _handleFullInMessage(name, _compileInMessages(convo));
}

function _compileInMessages(convo) {
    let pack = {};
    let full_message = '';
    while (convo.in_queue.length > 0) {
        pack = convo.in_queue.shift();
        full_message += pack.message;
    }
    pack.message = full_message;
    return pack;
}

function _handleFullInMessage(sender, recieved) {
    console.log(`responding to **${JSON.stringify(recieved)}**`);
    
    const convo = convoManager._getConvo(sender);
    convo.active = true;

    let message = _tagMessage(recieved.message);
    if (recieved.end) {
        convo.end();
        sender = 'system'; // bot will respond to system instead of the other bot
        message = `Conversation with ${sender} ended with message: "${message}"`;
    }
    else if (recieved.start)
        agent.shut_up = false;
    convo.inMessageTimer = null;
    agent.handleMessage(sender, message);
}


function _tagMessage(message) {
    return "(FROM OTHER BOT)" + message;
}

async function _resumeSelfPrompter() {
    await new Promise(resolve => setTimeout(resolve, 5000));
    self_prompter_paused = false;
    agent.self_prompter.start();
}
