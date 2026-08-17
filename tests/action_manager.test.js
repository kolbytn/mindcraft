import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { ActionManager } from '../src/agent/action_manager.js';

function makeAgent() {
    const bot = new EventEmitter();
    bot.output = '';
    bot.interrupt_code = false;

    return {
        bot,
        self_prompter: { isActive: () => false },
        history: { add: () => {} },
        isIdle() { return !this.actions?.executing; },
        clearBotLogs() {
            bot.output = '';
            bot.interrupt_code = false;
        },
        requestInterrupt() {
            bot.interrupt_code = true;
        },
        cleanKill() {}
    };
}

test('a previous timeout does not leak into the next action result', async () => {
    const agent = makeAgent();
    const actions = new ActionManager(agent);
    agent.actions = actions;
    actions.timedout = true;

    const result = await actions.runAction('test', async () => {}, { timeout: -1 });

    assert.equal(result.success, true);
    assert.equal(result.timedout, false);
});

test('thrown action errors preserve their stack trace', async () => {
    const agent = makeAgent();
    const actions = new ActionManager(agent);
    agent.actions = actions;

    const result = await actions.runAction('throwing', async () => {
        throw new Error('boom');
    }, { timeout: -1 });

    assert.equal(result.success, false);
    assert.match(result.message, /Error: boom/);
    assert.match(result.message, /Stack trace:/);
    assert.doesNotMatch(result.message, /Stack trace:\nundefined/);
});
