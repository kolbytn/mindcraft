import settings from '../../settings.js';
import { readFileSync } from 'fs';
import { containsCommand } from './commands/index.js';

let agent;
const agent_names = settings.profiles.map((p) => JSON.parse(readFileSync(p, 'utf8')).name);

let inMessageTimer = null;
let MAX_TURNS = -1;

export function isOtherAgent(name) {
    return agent_names.some((n) => n === name);
}

export function initConversationManager(a) {
    agent = a;
}

class Conversation {
    constructor(name) {
        this.name = name;
        this.turn_count = 0;
        this.ignore_until_start = false;
        this.blocked = false;
        this.in_queue = [];
    }

    reset() {
        this.ignore_until_start = false;
        this.turn_count = 0;
        this.in_queue = [];
    }

    countTurn() {
        this.turn_count++;
    }

    over() {
        return this.turn_count > MAX_TURNS && MAX_TURNS !== -1;
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

export function startChat(send_to, message, max_turns=5) {
    MAX_TURNS = max_turns;
    const convo = _getConvo(send_to);
    convo.reset();
    sendToBot(send_to, message, true);
}

export function sendToBot(send_to, message, start=false) {
    if (message.length > 197)
        message = message.substring(0, 197);
    if (!isOtherAgent(send_to)) {
        agent.bot.whisper(send_to, message);
        return;
    }
    const convo = _getConvo(send_to);
    if (convo.ignore_until_start)
        return;
    if (convo.over()) {
        endChat(send_to);
        return;
    }

    const end = message.includes('!endChat');
    const json = {
        'message': message,
        start,
        end,
        'idle': agent.isIdle()
    };

    agent.bot.whisper(send_to, JSON.stringify(json));
}

export function recieveFromBot(sender, json) {
    const convo = _getConvo(sender);
    console.log(`decoding **${json}**`);
    const recieved = JSON.parse(json);
    if (recieved.start) {
        convo.reset();
        MAX_TURNS = -1;
    }
    if (convo.ignore_until_start)
        return;
    if (convo.turn_count > 10) {
        console.warn('Reached max messages from bot:', sender);
        endChat(sender);
        agent.bot.chat('chat maxxed out, ending conversation');
        return;
    }

    convo.queue(recieved);

    if (inMessageTimer)
        clearTimeout(inMessageTimer);
    if (containsCommand(recieved.message))
        inMessageTimer = setTimeout(() => _processInMessageQueue(sender), 5000);
    else
        inMessageTimer = setTimeout(() => _processInMessageQueue(sender), 200);
}

export function _processInMessageQueue(name) {
    const convo = _getConvo(name);
    let pack = null;
    let full_message = '';
    while (convo.in_queue.length > 0) {
        pack = convo.in_queue.shift();
        full_message += pack.message;
    }
    pack.message = full_message;
    _handleFullInMessage(name, pack);
}

export function _handleFullInMessage(sender, recieved) {
    console.log(`responding to **${recieved}**`);
    
    const convo = _getConvo(sender);

    convo.countTurn();
    const message = _tagMessage(recieved.message);
    if (recieved.end || (!recieved.idle && !agent.isIdle()) || convo.over()) { 
        // if end signal from other bot, or both are busy, or past max turns,
        // add to history, but don't respond
        agent.history.add(sender, message);
        return;
    }
    agent.handleMessage(sender, message);
}

export function endChat(sender) {
    if (convos[sender]) {
        convos[sender].ignore_until_start = true;
    }
}

function _tagMessage(message) {
    return "(FROM OTHER BOT)" + message;
}
