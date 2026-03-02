import assert from 'assert';

export class ActionManager {
    constructor(agent) {
        this.agent = agent;
        this.executing = false;
        this.currentActionLabel = '';
        this.currentActionFn = null;
        this.timedout = false;
        this.resume_func = null;
        this.resume_name = '';
        this.last_action_time = 0;
        this.recent_action_counter = 0;
        // Stuck detection: track repeated same-label calls within a time window
        this._stuckTracker = {};   // { label: { count, firstSeen } }
        // Cross-invocation zero-collect tracker for gathering actions
        this._collectFailTracker = {}; // { blockType: { count, lastSeen } }
        this._COLLECT_FAIL_THRESHOLD = 3; // after 3 zero-collect results, force intervention
    }

    async resumeAction(actionFn, timeout) {
        return this._executeResume(actionFn, timeout);
    }

    async runAction(actionLabel, actionFn, { timeout, resume = false } = {}) {
        if (resume) {
            return this._executeResume(actionLabel, actionFn, timeout);
        } else {
            return this._executeAction(actionLabel, actionFn, timeout);
        }
    }

    async stop() {
        if (!this.executing) return;
        const timeout = setTimeout(() => {
            console.warn('Code execution refused stop after 10 seconds. Force-cancelling action.');
            this.executing = false;
        }, 10000);
        while (this.executing) {
            this.agent.requestInterrupt();
            console.log('waiting for code to finish executing...');
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        clearTimeout(timeout);
    }

    cancelResume() {
        this.resume_func = null;
        this.resume_name = null;
    }

    async _executeResume(actionLabel = null, actionFn = null, timeout = 10) {
        const new_resume = actionFn != null;
        if (new_resume) { // start new resume
            this.resume_func = actionFn;
            assert(actionLabel != null, 'actionLabel is required for new resume');
            this.resume_name = actionLabel;
        }
        if (this.resume_func != null && (this.agent.isIdle() || new_resume) && (!this.agent.self_prompter.isActive() || new_resume)) {
            this.currentActionLabel = this.resume_name;
            let res = await this._executeAction(this.resume_name, this.resume_func, timeout);
            this.currentActionLabel = '';
            return res;
        } else {
            return { success: false, message: null, interrupted: false, timedout: false };
        }
    }

    async _executeAction(actionLabel, actionFn, timeout = 10) {
        let TIMEOUT;
        try {
            if (this.last_action_time > 0) {
                let time_diff = Date.now() - this.last_action_time;
                if (time_diff < 20) {
                    this.recent_action_counter++;
                }
                else {
                    this.recent_action_counter = 0;
                }
                if (this.recent_action_counter > 3) {
                    console.warn('Fast action loop detected, cancelling resume.');
                    this.cancelResume(); // likely cause of repetition
                }
                if (this.recent_action_counter > 5) {
                    console.error('Infinite action loop detected, shutting down.');
                    this.agent.cleanKill('Infinite action loop detected, shutting down.');
                    return { success: false, message: 'Infinite action loop detected, shutting down.', interrupted: false, timedout: false };
                }
            }
            this.last_action_time = Date.now();

            // Detect slow repeating action patterns
            if (!this._actionHistory) this._actionHistory = [];
            this._actionHistory.push(actionLabel);
            if (this._actionHistory.length > 12) this._actionHistory.shift();
            if (this._actionHistory.length >= 6) {
                // Pattern repeat: exact 3-action sequence repeats
                const last3 = this._actionHistory.slice(-3).join(',');
                const prev3 = this._actionHistory.slice(-6, -3).join(',');
                // Frequency: any single action appears N+ times in the window
                const counts = {};
                for (const a of this._actionHistory) counts[a] = (counts[a] || 0) + 1;
                const maxCount = Math.max(...Object.values(counts));
                const loopAction = Object.keys(counts).find(a => counts[a] === maxCount);
                // RC27: Crafting chains legitimately need 5+ craftRecipe calls
                // (logs→planks→sticks→tool = 5+ sequential crafts). Raise threshold
                // for crafting actions and exempt non-identical craft sequences.
                const isCraftAction = loopAction && loopAction.includes('craftRecipe');
                const freqThreshold = isCraftAction ? 8 : 5;
                const isPatternLoop = last3 === prev3;
                const isFreqLoop = maxCount >= freqThreshold;
                if (isPatternLoop || isFreqLoop) {
                    const reason = isPatternLoop ? `pattern "${last3}" repeated` : `"${loopAction}" called ${maxCount} times`;
                    console.warn(`[ActionManager] Slow loop detected: ${reason}. Cancelling resume.`);
                    this.cancelResume();
                    this._actionHistory = [];
                    return { success: false, message: `Action loop detected (${reason}). Stopping to avoid infinite loop.`, interrupted: true, timedout: false };
                }
            }
            // ── Stuck detector: same action label ≥3 times within window ──────────
            const STUCK_WINDOW_MS = 15000;
            const STUCK_WINDOW_LONG_MS = 120000; // longer window for slow actions like collectBlocks
            const STUCK_THRESHOLD = 3;
            const stuckLabels = ['goToPlayer', 'collectBlocks', 'goToBlock', 'moveAway', 'goToBed', 'goToNearestBlock'];
            const slowLabels = ['collectBlocks']; // actions that take a long time
            const isStuckable = stuckLabels.some(l => actionLabel.includes(l));
            const isSlow = slowLabels.some(l => actionLabel.includes(l));
            const windowMs = isSlow ? STUCK_WINDOW_LONG_MS : STUCK_WINDOW_MS;
            const now = Date.now();
            if (isStuckable) {
                const t = this._stuckTracker[actionLabel];
                if (t && (now - t.firstSeen) < windowMs) {
                    t.count++;
                    if (t.count >= STUCK_THRESHOLD) {
                        console.warn(`[ActionManager] Stuck detected: "${actionLabel}" called ${t.count}x in ${Math.round((now - t.firstSeen)/1000)}s`);
                        this._stuckTracker = {};
                        this.cancelResume();
                        return {
                            success: false,
                            message: `Action output:\nStuck detected — "${actionLabel}" failed ${t.count} times in a row. Switch to a different approach immediately: try !searchForBlock with a range of 128+, !moveAway 50, or !newAction with an alternative strategy. Do NOT repeat the same command.`,
                            interrupted: true,
                            timedout: false
                        };
                    }
                } else {
                    // New action type — reset all stuck tracking
                    this._stuckTracker = { [actionLabel]: { count: 1, firstSeen: now } };
                }
            } else {
                // Non-stuckable action succeeded — reset tracker
                this._stuckTracker = {};
            }
            // ────────────────────────────────────────────────────────────────────

            console.log('executing code...\n');

            // await current action to finish (executing=false), with 10 seconds timeout
            // also tell agent.bot to stop various actions
            if (this.executing) {
                console.log(`action "${actionLabel}" trying to interrupt current action "${this.currentActionLabel}"`);
            }
            await this.stop();

            // clear bot logs and reset interrupt code
            this.agent.clearBotLogs();

            this.executing = true;
            this.currentActionLabel = actionLabel;
            this.currentActionFn = actionFn;

            // timeout in minutes
            if (timeout > 0) {
                TIMEOUT = this._startTimeout(timeout);
            }

            // start the action
            await actionFn();

            // mark action as finished + cleanup
            this.executing = false;
            this.currentActionLabel = '';
            this.currentActionFn = null;
            clearTimeout(TIMEOUT);

            // Capture raw output BEFORE truncation for reliable regex matching
            const rawOutput = this.agent.bot.output || '';

            // get bot activity summary (may truncate)
            let output = this.getBotOutputSummary();
            let interrupted = this.agent.bot.interrupt_code;
            let timedout = this.timedout;
            this.agent.clearBotLogs();

            // ── Cross-invocation zero-collect detection ──────────────────────
            // Use rawOutput for regex matching to avoid truncation issues
            if (actionLabel.includes('collectBlocks') && rawOutput) {
                const zeroMatch = rawOutput.match(/Collected 0 (\w+)/);
                const successMatch = rawOutput.match(/Collected (\d+) (\w+)/);
                if (zeroMatch) {
                    const blockType = zeroMatch[1];
                    const tracker = this._collectFailTracker;
                    if (!tracker[blockType]) tracker[blockType] = { count: 0, lastSeen: 0 };
                    tracker[blockType].count++;
                    tracker[blockType].lastSeen = Date.now();
                    if (tracker[blockType].count >= this._COLLECT_FAIL_THRESHOLD) {
                        const failCount = tracker[blockType].count;
                        tracker[blockType] = { count: 0, lastSeen: 0 }; // reset
                        console.warn(`[ActionManager] Gather loop: collected 0 ${blockType} ${failCount} times — forcing explore`);
                        this.cancelResume();
                        // Set flag so agent.js auto-executes !explore(200) bypassing the LLM
                        this.agent._forceExplore = { distance: 200, blockType };
                        output += `\n\nArea depleted: collected 0 ${blockType} ${failCount} times. Auto-exploring 200 blocks to find fresh resources.`;
                    }
                } else if (successMatch && parseInt(successMatch[1]) > 0) {
                    // Success — reset tracker for this block type
                    const blockType = successMatch[2];
                    if (this._collectFailTracker[blockType]) {
                        this._collectFailTracker[blockType] = { count: 0, lastSeen: 0 };
                    }
                }
            }
            // ────────────────────────────────────────────────────────────────

            // if not interrupted and not generating, emit idle event
            if (!interrupted) {
                this.agent.bot.emit('idle');
            }

            // return action status report
            return { success: true, message: output, interrupted, timedout };
        } catch (err) {
            this.executing = false;
            this.currentActionLabel = '';
            this.currentActionFn = null;
            clearTimeout(TIMEOUT);
            this.cancelResume();
            console.error("Code execution triggered catch:", err);
            // Log the full stack trace
            const stackTrace = err.stack || '';
            console.error(stackTrace);
            await this.stop();

            let message = this.getBotOutputSummary() +
                '!!Code threw exception!!\n' +
                'Error: ' + err.toString() + '\n' +
                'Stack trace:\n' + stackTrace + '\n';

            let interrupted = this.agent.bot.interrupt_code;
            this.agent.clearBotLogs();
            if (!interrupted) {
                this.agent.bot.emit('idle');
            }
            return { success: false, message, interrupted, timedout: false };
        }
    }

    getBotOutputSummary() {
        const { bot } = this.agent;
        if (bot.interrupt_code && !this.timedout) return '';
        let output = bot.output;
        const MAX_OUT = 500;
        if (output.length > MAX_OUT) {
            output = `Action output is very long (${output.length} chars) and has been shortened.\n
          First outputs:\n${output.substring(0, MAX_OUT / 2)}\n...skipping many lines.\nFinal outputs:\n ${output.substring(output.length - MAX_OUT / 2)}`;
        }
        else {
            output = 'Action output:\n' + output.toString();
        }
        bot.output = '';
        return output;
    }

    _startTimeout(TIMEOUT_MINS = 10) {
        return setTimeout(async () => {
            console.warn(`Code execution timed out after ${TIMEOUT_MINS} minutes. Attempting force stop.`);
            this.timedout = true;
            this.agent.history.add('system', `Code execution timed out after ${TIMEOUT_MINS} minutes. Attempting force stop.`);
            await this.stop(); // last attempt to stop
        }, TIMEOUT_MINS * 60 * 1000);
    }

}