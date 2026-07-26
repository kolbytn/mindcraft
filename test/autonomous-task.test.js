import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTaskDecision } from '../src/agent/self_prompter.js';

test('parses an active autonomous decision', () => {
    const decision = parseTaskDecision(JSON.stringify({
        status: 'active',
        plan: ['inspect', 'collect'],
        current_step: 'inspect',
        reason: 'Need world evidence',
        command: '!nearbyBlocks'
    }));
    assert.equal(decision.status, 'active');
    assert.equal(decision.command, '!nearbyBlocks');
    assert.deepEqual(decision.plan, ['inspect', 'collect']);
});

test('extracts JSON from reasoning and markdown fences', () => {
    const decision = parseTaskDecision('<think>private</think>```json\n' + JSON.stringify({
        status: 'completed',
        plan: ['collect'],
        current_step: 'verify',
        reason: 'Inventory proves success',
        command: ''
    }) + '\n```');
    assert.equal(decision.status, 'completed');
    assert.equal(decision.command, '');
});

test('rejects unknown task status', () => {
    assert.throws(() => parseTaskDecision('{"status":"done"}'), /Invalid task status/);
});

test('requires a command while active', () => {
    assert.throws(() => parseTaskDecision('{"status":"active","command":""}'), /requires a command/);
});
