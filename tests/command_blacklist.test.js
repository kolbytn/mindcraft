import test from 'node:test';
import assert from 'node:assert/strict';
import { blacklistCommands, commandExists, getCommandDocs } from '../src/agent/commands/index.js';

test('blacklisting removes a command from lookup and generated docs', () => {
    assert.equal(commandExists('!nearbyBlocks'), true);
    blacklistCommands(['!nearbyBlocks']);
    assert.equal(commandExists('!nearbyBlocks'), false);

    const docs = getCommandDocs({ blocked_actions: [] });
    assert.doesNotMatch(docs, /!nearbyBlocks/);
});
