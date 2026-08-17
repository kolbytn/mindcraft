import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAICompatibleChat } from '../src/models/openai_compatible.js';

function makeClient() {
    return new OpenAICompatibleChat({
        model_name: 'test-model',
        apiKey: 'test-key',
        defaultURL: 'http://localhost:1234/v1',
        defaultModel: 'test-model',
        formatMessages: messages => messages,
    });
}

test('finish_reason length preserves the partial completion', async () => {
    const client = makeClient();
    client.openai = {
        chat: {
            completions: {
                create: async () => ({
                    choices: [{ finish_reason: 'length', message: { content: 'partial answer' } }]
                })
            }
        }
    };

    const result = await client.sendRequest([{ role: 'user', content: 'hello' }], 'system');
    assert.equal(result, 'partial answer');
});

test('real context errors retry with a shorter conversation', async () => {
    const client = makeClient();
    const messageCounts = [];
    let calls = 0;
    client.openai = {
        chat: {
            completions: {
                create: async (pack) => {
                    messageCounts.push(pack.messages.length);
                    calls++;
                    if (calls === 1) {
                        const error = new Error('too long');
                        error.code = 'context_length_exceeded';
                        throw error;
                    }
                    return { choices: [{ finish_reason: 'stop', message: { content: 'ok' } }] };
                }
            }
        }
    };

    const result = await client.sendRequest([
        { role: 'user', content: 'old' },
        { role: 'assistant', content: 'reply' },
        { role: 'user', content: 'new' },
    ], 'system');

    assert.equal(result, 'ok');
    assert.deepEqual(messageCounts, [4, 3]);
});
