import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { botDataPath, getDataRoot } from '../src/utils/data_paths.js';

test('bot data paths are anchored under the Mindcraft data root', () => {
    assert.equal(
        botDataPath('TestBot', 'memory.json'),
        path.join(getDataRoot(), 'bots', 'TestBot', 'memory.json')
    );
    assert.equal(path.isAbsolute(getDataRoot()), true);
});
