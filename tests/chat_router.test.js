import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatRouter } from '../src/agent/chat_router.js';
import { setSettings } from '../src/agent/settings.js';

test('openChat whispers configured users and preserves command syntax', async () => {
    setSettings({
        language: 'en',
        only_chat_with: ['alice'],
        speak: false,
        chat_ingame: true,
    });

    const sent = [];
    const agent = {
        name: 'TestBot',
        shut_up: false,
        bot: {
            whisper: (user, message) => sent.push({ user, message }),
        },
        prompter: { profile: {} },
    };

    const router = new ChatRouter(agent);
    await router.openChat('hello !inventory');

    assert.deepEqual(sent, [{ user: 'alice', message: 'hello !inventory' }]);
});
