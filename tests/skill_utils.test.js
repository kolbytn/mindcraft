import test from 'node:test';
import assert from 'node:assert/strict';
import { log, wait } from '../src/agent/library/skill_utils.js';

test('skill log appends output', () => {
    const bot = { output: '' };
    log(bot, 'hello');
    assert.equal(bot.output, 'hello\n');
});

test('wait can be interrupted before sleeping', async () => {
    const bot = { interrupt_code: true };
    assert.equal(await wait(bot, 1000), false);
});

test('wait keeps its generated-code docs after extraction', () => {
    assert.match(wait.toString(), /\/\*\*/);
    assert.match(wait.toString(), /skills\.wait/);
});
