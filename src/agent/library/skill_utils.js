export function log(bot, message) {
    bot.output += message + '\n';
}

export async function wait(bot, milliseconds) {
    // setTimeout is disabled for generated actions to prevent unawaited code,
    // so this is a safe interruptible alternative.
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
