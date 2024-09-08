/**
 * Logs a message to the bot's output and optionally sends it to the chat.
 * 
 * @param {Object} bot - The Mineflayer bot instance.
 * @param {string} message - The message to be logged.
 * @param {boolean} [chat=false] - If true, the message will also be sent to the in-game chat.
 */
export function log(bot, message, chat=false) {
    bot.output += message + '\n';
    if (chat)
        bot.chat(message);
}