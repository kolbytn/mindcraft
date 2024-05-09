export class SelfPrompter {
    constructor(agent) {
        this.agent = agent;
        this.on = false;
        this.loop_active = false;
        this.interrupt = false;
        this.prompt = '';
        this.idle_time = 0;
        this.cooldown = 2000;
    }

    start(prompt) {
        console.log('Self-prompting started.');
        if (!prompt) {
            return 'No prompt specified. Ignoring request.';
        }
        if (this.on) {
            this.prompt = prompt;
        }
        this.on = true;
        this.prompt = prompt;
        this.startLoop();
    }

    async startLoop() {
        if (this.loop_active) {
            console.warn('Self-prompt loop is already active. Ignoring request.');
            return;
        }
        console.log('starting self-prompt loop')
        this.loop_active = true;
        let no_command_count = 0;
        const MAX_NO_COMMAND = 3;
        while (!this.interrupt) {
            let msg = `You are self-prompting with the prompt: '${this.prompt}'. Your next response MUST contain a command !withThisSyntax. Respond:`;
            
            let used_command = await this.agent.handleMessage('system', msg, true);
            if (!used_command) {
                no_command_count++;
                if (no_command_count >= MAX_NO_COMMAND) {
                    let out = `Agent did not use command in the last ${MAX_NO_COMMAND} auto-prompts. Stopping auto-prompting.`;
                    this.agent.bot.chat(out);
                    console.warn(out);
                    this.on = false;
                    break;
                }
            }
            else {
                no_command_count = 0;
                await new Promise(r => setTimeout(r, this.cooldown));
            }
        }
        console.log('self prompt loop stopped')
        this.loop_active = false;
        this.interrupt = false;
    }

    update(delta) {
        // automatically restarts loop
        if (this.on && !this.loop_active && !this.interrupt) {
            if (this.agent.isIdle())
                this.idle_time += delta;
            else
                this.idle_time = 0;

            if (this.idle_time >= this.cooldown) {
                console.log('Restarting self-prompting...');
                this.startLoop();
                this.idle_time = 0;
            }
        }
    }

    async stopLoop() {
        // you can call this without await if you don't need to wait for it to finish
        console.log('stopping self-prompt loop')
        this.interrupt = true;
        while (this.loop_active) {
            await new Promise(r => setTimeout(r, 500));
        }
        this.interrupt = false;
    }

    async stop() {
        this.interrupt = true;
        await this.agent.coder.stop();
        await this.stopLoop();
        this.on = false;
    }
}