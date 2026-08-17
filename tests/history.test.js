import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { History } from '../src/agent/history.js';

test('archived history is appended as JSONL', async () => {
    const originalCwd = process.cwd();
    const dir = mkdtempSync(path.join(tmpdir(), 'mindcraft-history-'));
    process.chdir(dir);

    try {
        const agent = {
            name: 'TestBot',
            prompter: { promptMemSaving: async () => '' },
            self_prompter: { state: 0, isStopped: () => true, prompt: '' },
            task: { taskStartTime: 0 },
            last_sender: null
        };
        const history = new History(agent);

        await history.appendFullHistory([{ role: 'user', content: 'one' }]);
        await history.appendFullHistory([{ role: 'assistant', content: 'two' }]);

        const lines = readFileSync(history.full_history_fp, 'utf8').trim().split('\n').map(JSON.parse);
        assert.deepEqual(lines, [
            { role: 'user', content: 'one' },
            { role: 'assistant', content: 'two' }
        ]);
    } finally {
        process.chdir(originalCwd);
        rmSync(dir, { recursive: true, force: true });
    }
});
