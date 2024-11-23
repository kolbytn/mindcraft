import settings from '../../settings.js';
import { readFileSync } from 'fs';
import { containsCommand } from './commands/index.js';
import { sendBotChatToServer } from './server_proxy.js';

let agent;
let agent_names = settings.profiles.map((p) => JSON.parse(readFileSync(p, 'utf8')).name);

let self_prompter_paused = false;

export function isOtherAgent(name) {
    return agent_names.some((n) => n === name);
}

export function updateAgents(names) {
    agent_names = names;
}

export function initConversationManager(a) {
    agent = a;
}

export function inConversation() {
    return Object.values(convos).some(c => c.active);
}

export function endConversation(sender) {
    if (convos[sender]) {
        convos[sender].end();
        if (self_prompter_paused && !inConversation()) {
            _resumeSelfPrompter();
        }
    }
}

export function endAllChats() {
    for (const sender in convos) {
        convos[sender].end();
    }
    if (self_prompter_paused) {
        _resumeSelfPrompter();
    }
}

export function scheduleSelfPrompter() {
    self_prompter_paused = true;
}

export function cancelSelfPrompter() {
    self_prompter_paused = false;
}

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
    }

    queue(message) {
        this.in_queue.push(message);
    }
}
const convos = {};

function _getConvo(name) {
    if (!convos[name])
        convos[name] = new Conversation(name);
    return convos[name];
}

export async function startConversation(send_to, message) {
    const convo = _getConvo(send_to);
    convo.reset();
    
    if (agent.self_prompter.on) {
        await agent.self_prompter.stop();
        self_prompter_paused = true;
    }
    convo.active = true;
    sendToBot(send_to, message, true);
}

export function sendToBot(send_to, message, start=false) {
    if (settings.chat_bot_messages)
        agent.bot.chat(`(To ${send_to}) ${message}`);
    if (!isOtherAgent(send_to)) {
        agent.bot.whisper(send_to, message);
        return;
    }
    const convo = _getConvo(send_to);
    if (convo.ignore_until_start)
        return;
    convo.active = true;
    
    const end = message.includes('!endConversation');
    const json = {
        'message': message,
        start,
        end,
    };

    // agent.bot.whisper(send_to, JSON.stringify(json));
    sendBotChatToServer(send_to, JSON.stringify(json));
}

export async function recieveFromBot(sender, json) {
    const convo = _getConvo(sender);
    console.log(`decoding **${json}**`);
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

// returns true if the other bot has a scheduled response
export function responseScheduledFor(sender) {
    if (!isOtherAgent(sender))
        return false;
    const convo = _getConvo(sender);
    return !!convo.inMessageTimer;
}


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
    const convo = _getConvo(name);
    let pack = {};
    let full_message = '';
    while (convo.in_queue.length > 0) {
        pack = convo.in_queue.shift();
        full_message += pack.message;
    }
    pack.message = full_message;
    _handleFullInMessage(name, pack);
}

function _handleFullInMessage(sender, recieved) {
    console.log(`responding to **${JSON.stringify(recieved)}**`);
    
    const convo = _getConvo(sender);
    convo.active = true;

    const message = _tagMessage(recieved.message);
    if (recieved.end) {
        convo.end();
        // if end signal from other bot, add to history but don't respond
        agent.history.add(sender, message);
        return;
    }
    if (recieved.start)
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
