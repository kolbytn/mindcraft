import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBooleanEnv, parseIntegerEnv, parseJsonEnv } from '../src/utils/env.js';

test('boolean parser does not treat "false" as truthy', () => {
    assert.equal(parseBooleanEnv('true'), true);
    assert.equal(parseBooleanEnv('false'), false);
    assert.equal(parseBooleanEnv('1'), true);
    assert.equal(parseBooleanEnv('0'), false);
    assert.throws(() => parseBooleanEnv('maybe'), /must be a boolean/);
});

test('integer parser returns numbers and rejects mixed values', () => {
    assert.equal(parseIntegerEnv('42'), 42);
    assert.equal(parseIntegerEnv('-1'), -1);
    assert.throws(() => parseIntegerEnv('42px'), /must be an integer/);
});

test('JSON parser includes the setting name in failures', () => {
    assert.deepEqual(parseJsonEnv('["a"]'), ['a']);
    assert.throws(() => parseJsonEnv('{', 'PROFILES'), /PROFILES/);
});
