import { containsCommand } from './commands/index.js';
import convoManager from './conversation.js';
import { handleTranslation } from '../utils/translator.js';
import { speak } from './speak.js';
import { sendOutputToServer } from './mindserver_proxy.js';
import settings from './settings.js';

export class ChatRouter {
    constructor(agent) {
        this.agent = agent;
    }

    async routeResponse(to_player, message) {
        const agent = this.agent;
        if (agent.shut_up) return;

        const self_prompt = to_player === 'system' || to_player === agent.name;
        if (self_prompt && agent.last_sender) {
            // If the agent is prompted by the system while still in a bot
            // conversation, route the response back to the last sender.
            to_player = agent.last_sender;
        }

        if (convoManager.isOtherAgent(to_player) && convoManager.inConversation(to_player)) {
            convoManager.sendToBot(to_player, message);
        }
        else {
            // Preserve Agent's existing fire-and-forget open-chat behavior.
            void this.openChat(message);
        }
    }

    async openChat(message) {
        const agent = this.agent;
        let to_translate = message;
        let remaining = '';
        const command_name = containsCommand(message);
        const translate_up_to = command_name ? message.indexOf(command_name) : -1;
        if (translate_up_to !== -1) {
            // Do not translate command syntax.
            to_translate = to_translate.substring(0, translate_up_to);
            remaining = message.substring(translate_up_to);
        }

        message = (await handleTranslation(to_translate)).trim() + ' ' + remaining;
        // Newlines are interpreted as separate chats, which triggers spam filters.
        message = message.replaceAll('\n', ' ');

        if (settings.only_chat_with.length > 0) {
            for (const username of settings.only_chat_with) {
                agent.bot.whisper(username, message);
            }
        }
        else {
            if (settings.speak) {
                speak(to_translate, agent.prompter.profile.speak_model);
            }
            if (settings.chat_ingame) {
                agent.bot.chat(message);
            }
            sendOutputToServer(agent.name, message);
        }
    }
}
