import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { hellsKitchenProgressManager as progress } from '../src/agent/tasks/hells_kitchen_progress.js';

test('Hells Kitchen progress persists and combines both agents', () => {
    const originalCwd = process.cwd();
    const dir = mkdtempSync(path.join(tmpdir(), 'mindcraft-hk-'));
    process.chdir(dir);

    try {
        progress.resetTask('task_hells_kitchen');
        assert.equal(progress.isTaskComplete('task_hells_kitchen'), false);

        progress.updateAgentProgress('task_hells_kitchen', 0, true);
        assert.equal(progress.isTaskComplete('task_hells_kitchen'), false);

        progress.updateAgentProgress('task_hells_kitchen', 1, true);
        assert.equal(progress.isTaskComplete('task_hells_kitchen'), true);
    } finally {
        process.chdir(originalCwd);
        rmSync(dir, { recursive: true, force: true });
    }
});
