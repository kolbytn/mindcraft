import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveProfile } from '../src/models/profile_resolver.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultsDir = path.resolve(here, '../profiles/defaults');

test('individual profile values win over base/default values', () => {
    const profile = { name: 'TestBot', modes: { custom: true } };
    const resolved = resolveProfile(profile, 'survival', defaultsDir);

    assert.equal(resolved, profile);
    assert.deepEqual(resolved.modes, { custom: true });
    assert.equal(typeof resolved.conversing, 'string');
});

test('unknown base profiles fail clearly', () => {
    assert.throws(
        () => resolveProfile({ name: 'TestBot' }, 'does-not-exist', defaultsDir),
        /Unknown base profile/
    );
});
