import test from 'node:test';
import assert from 'node:assert/strict';
import { lockdown as secureLockdown } from '../src/agent/library/lockdown.js';

test('SES lockdown wrapper invokes the SES global and is idempotent', () => {
    assert.equal(typeof globalThis.lockdown, 'function');
    assert.doesNotThrow(() => secureLockdown());
    assert.doesNotThrow(() => secureLockdown());
});
