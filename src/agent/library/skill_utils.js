export function log(bot, message) {
    bot.output += message + '\n';
}

export async function wait(bot, milliseconds) {
    /**
     * Waits for the given number of milliseconds.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {number} milliseconds, the number of milliseconds to wait.
     * @returns {Promise<boolean>} true if the wait was successful, false otherwise.
     * @example
     * await skills.wait(bot, 1000);
     **/
    // setTimeout is disabled to prevent unawaited code, so this is a safe alternative that enables interrupts
    let timeLeft = milliseconds;
    const startTime = Date.now();

    while (timeLeft > 0) {
        if (bot.interrupt_code) return false;

        const waitTime = Math.min(2000, timeLeft);
        await new Promise(resolve => setTimeout(resolve, waitTime));

        const elapsed = Date.now() - startTime;
        timeLeft = milliseconds - elapsed;
    }
    return true;
}
