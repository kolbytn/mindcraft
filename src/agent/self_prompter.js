const STOPPED = 0
const ACTIVE = 1
const PAUSED = 2
export class SelfPrompter {
    constructor(agent) {
        this.agent = agent;
        this.state = STOPPED;
        this.loop_active = false;
        this.interrupt = false;
        this.prompt = '';
        this.idle_time = 0;
        this.cooldown = 2000;
    }

    start(prompt) {
        console.log('[SELF-PROMPTER] Self-prompting started.');
        console.log('[SELF-PROMPTER] Prompt:', prompt);
        if (!prompt) {
            if (!this.prompt)
                return 'No prompt specified. Ignoring request.';
            prompt = this.prompt;
        }
        this.state = ACTIVE;
        this.prompt = prompt;
        console.log('[SELF-PROMPTER] State set to ACTIVE, starting loop...');
        this.startLoop();
    }

    isActive() {
        return this.state === ACTIVE;
    }

    isStopped() {
        return this.state === STOPPED;
    }

    isPaused() {
        return this.state === PAUSED;
    }

    async handleLoad(prompt, state) {
        if (state == undefined)
            state = STOPPED;
        this.state = state;
        this.prompt = prompt;
        if (state !== STOPPED && !prompt)
            throw new Error('No prompt loaded when self-prompting is active');
        if (state === ACTIVE) {
            await this.start(prompt);
        }
    }

    setPromptPaused(prompt) {
        this.prompt = prompt;
        this.state = PAUSED;
    }

    async startLoop() {
        if (this.loop_active) {
            console.warn('[SELF-PROMPTER] Loop is already active. Ignoring request.');
            return;
        }
        console.log('[SELF-PROMPTER] Starting self-prompt loop')
        this.loop_active = true;
        let no_command_count = 0;
        const MAX_NO_COMMAND = 3;
        let iteration = 0;
        while (!this.interrupt) {
            iteration++;
            console.log(`[SELF-PROMPTER] Loop iteration ${iteration}, no_command_count: ${no_command_count}`);
            const msg = `You are self-prompting with the goal: '${this.prompt}'. Your next response MUST contain a command with this syntax: !commandName. Respond:`;

            console.log('[SELF-PROMPTER] Sending prompt to agent...');
            let used_command = await this.agent.handleMessage('system', msg, -1);
            console.log(`[SELF-PROMPTER] Agent response: used_command=${used_command}`);

            if (!used_command) {
                no_command_count++;
                console.warn(`[SELF-PROMPTER] No command used! Count: ${no_command_count}/${MAX_NO_COMMAND}`);
                if (no_command_count >= MAX_NO_COMMAND) {
                    let out = `Agent did not use command in the last ${MAX_NO_COMMAND} auto-prompts. Stopping auto-prompting.`;
                    this.agent.openChat(out);
                    console.warn('[SELF-PROMPTER]', out);
                    this.state = STOPPED;
                    break;
                }
            }
            else {
                no_command_count = 0;
                console.log(`[SELF-PROMPTER] Command used! Waiting ${this.cooldown}ms before next iteration...`);
                await new Promise(r => setTimeout(r, this.cooldown));
            }
        }
        console.log('[SELF-PROMPTER] Self prompt loop stopped')
        this.loop_active = false;
        this.interrupt = false;
    }

    update(delta) {
        // automatically restarts loop
        if (this.state === ACTIVE && !this.loop_active && !this.interrupt) {
            const isIdle = this.agent.isIdle();
            if (isIdle) {
                this.idle_time += delta;
                if (this.idle_time % 5000 < delta) { // Log every ~5 seconds
                    console.log(`[SELF-PROMPTER] Waiting for idle cooldown: ${this.idle_time}ms / ${this.cooldown}ms`);
                }
            }
            else {
                if (this.idle_time > 0) {
                    console.log(`[SELF-PROMPTER] Agent no longer idle, resetting idle_time`);
                }
                this.idle_time = 0;
            }

            if (this.idle_time >= this.cooldown) {
                console.log('[SELF-PROMPTER] Restarting self-prompting after idle cooldown...');
                this.startLoop();
                this.idle_time = 0;
            }
        }
        else {
            this.idle_time = 0;
        }
    }

    async stopLoop() {
        // you can call this without await if you don't need to wait for it to finish
        if (this.interrupt)
            return;
        console.log('stopping self-prompt loop')
        this.interrupt = true;
        while (this.loop_active) {
            await new Promise(r => setTimeout(r, 500));
        }
        this.interrupt = false;
    }

    async stop(stop_action=true) {
        this.interrupt = true;
        if (stop_action)
            await this.agent.actions.stop();
        this.stopLoop();
        this.state = STOPPED;
    }

    async pause() {
        this.interrupt = true;
        await this.agent.actions.stop();
        this.stopLoop();
        this.state = PAUSED;
    }

    shouldInterrupt(is_self_prompt) { // to be called from handleMessage
        return is_self_prompt && (this.state === ACTIVE || this.state === PAUSED) && this.interrupt;
    }

    handleUserPromptedCmd(is_self_prompt, is_action) {
        // if a user messages and the bot responds with an action, stop the self-prompt loop
        if (!is_self_prompt && is_action) {
            this.stopLoop();
            // this stops it from responding from the handlemessage loop and the self-prompt loop at the same time
        }
    }
}