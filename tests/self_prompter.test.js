import test from 'node:test';
import assert from 'node:assert/strict';
import { SelfPrompter } from '../src/agent/self_prompter.js';

function makePrompter() {
    const agent = {
        actions: { stop: async () => {} },
        isIdle: () => true,
        handleMessage: async () => true,
        openChat: () => {},
    };
    return new SelfPrompter(agent);
}

test('stopLoop waits even when interrupt was already requested', async () => {
    const prompter = makePrompter();
    prompter.loop_active = true;
    prompter.interrupt = true;
    setTimeout(() => { prompter.loop_active = false; }, 20);

    await prompter.stopLoop();

    assert.equal(prompter.loop_active, false);
    assert.equal(prompter.interrupt, false);
});

test('stop changes state immediately and clears the interrupt after shutdown', async () => {
    const prompter = makePrompter();
    prompter.state = 1;
    prompter.loop_active = true;
    setTimeout(() => { prompter.loop_active = false; }, 20);

    const stopping = prompter.stop(false);
    assert.equal(prompter.isStopped(), true);
    await stopping;
    assert.equal(prompter.interrupt, false);
});
