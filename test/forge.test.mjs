// Dependency-free unit tests for the pure, server-independent parts of Forge
// support (the FML wire codec, the mod-list reply, and registry/block merging).
// No modded server and no test framework required.
//
//   Run:  node --test test/forge.test.mjs
//
// These cover the "scary" binary + injection code so a reviewer can trust it
// without standing up a Forge modpack server. The handshake networking and the
// actual createBot() wiring are exercised end-to-end against a real server (see
// the PR description); they are intentionally out of scope for these unit tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
    readVarInt, writeVarInt, readString, writeString,
    encodeWrapper, decodeWrapper, buildModListReply,
    mergeItemsAndEntities, mergeBlocks, injectModdedData,
    attachForgeHandshake,
} from '../src/utils/forge.js';

// Golden (asymmetric) byte assertions. The round-trip tests below would still pass
// if enc/dec shared an inverse bug, so pin the actual on-the-wire bytes here.
test('VarInt golden bytes (300 <-> ac 02)', () => {
    assert.equal(readVarInt(Buffer.from([0xac, 0x02]), { i: 0 }), 300);
    assert.deepEqual([...writeVarInt(300)], [0xac, 0x02]);
    assert.deepEqual([...writeVarInt(0)], [0x00]);
    assert.deepEqual([...writeVarInt(127)], [0x7f]);
});

test('String golden bytes (length-prefix + UTF-8)', () => {
    // "AB" -> VarInt len 2, then 0x41 0x42
    assert.deepEqual([...writeString('AB')], [0x02, 0x41, 0x42]);
    assert.equal(readString(Buffer.from([0x02, 0x41, 0x42]), { i: 0 }), 'AB');
});

test('loginwrapper golden bytes (channel + len + payload)', () => {
    // channel "a" (len 1, 0x61), payloadLen 2, payload [0x63 0x02]
    assert.deepEqual([...encodeWrapper('a', Buffer.from([0x63, 0x02]))], [0x01, 0x61, 0x02, 0x63, 0x02]);
});

test('VarInt round-trips single- and multi-byte values', () => {
    for (const v of [0, 1, 99, 127, 128, 300, 16384, 2097151, 123456789]) {
        const o = { i: 0 };
        assert.equal(readVarInt(writeVarInt(v), o), v);
    }
});

test('String round-trips (length-prefixed UTF-8)', () => {
    for (const s of ['', 'fml:handshake', 'create:cogwheel', 'minecraft:stone']) {
        const o = { i: 0 };
        assert.equal(readString(writeString(s), o), s);
    }
});

test('loginwrapper envelope round-trips channel + payload', () => {
    const payload = Buffer.from([2, 10, 20, 30]);
    const { channel, payload: got } = decodeWrapper(encodeWrapper('fml:handshake', payload));
    assert.equal(channel, 'fml:handshake');
    assert.deepEqual([...got], [...payload]);
});

// Build a small S2CModList payload (discriminator 1) the way the server sends it.
function buildModList(mods, channels, registries) {
    const parts = [writeVarInt(1)];
    parts.push(writeVarInt(mods.length)); mods.forEach(m => parts.push(writeString(m)));
    parts.push(writeVarInt(channels.length)); channels.forEach(([n, v]) => parts.push(writeString(n), writeString(v)));
    parts.push(writeVarInt(registries.length)); registries.forEach(r => parts.push(writeString(r)));
    return Buffer.concat(parts);
}

test('C2SModListReply echoes the server mod/channel/registry lists', () => {
    const mods = ['minecraft', 'forge', 'create'];
    const channels = [['fml:handshake', '1.2.3.4'], ['create:main', '1']];
    const registries = ['minecraft:block', 'minecraft:item'];

    const reply = buildModListReply(buildModList(mods, channels, registries));

    // Decode the reply and assert it echoes everything back.
    const o = { i: 0 };
    assert.equal(readVarInt(reply, o), 2); // C2SModListReply discriminator
    const gotMods = [];
    for (let n = readVarInt(reply, o); n > 0; n--) gotMods.push(readString(reply, o));
    assert.deepEqual(gotMods, mods);
    const gotChannels = [];
    for (let n = readVarInt(reply, o); n > 0; n--) gotChannels.push([readString(reply, o), readString(reply, o)]);
    assert.deepEqual(gotChannels, channels);
    const gotRegs = [];
    for (let n = readVarInt(reply, o); n > 0; n--) gotRegs.push([readString(reply, o), readString(reply, o)]);
    // registries are echoed as [name, "<hash marker>"] pairs
    assert.deepEqual(gotRegs.map(r => r[0]), registries);
});

function fakeMcData() {
    return {
        items: {}, itemsByName: {}, itemsArray: [],
        entities: {}, entitiesByName: {}, entitiesArray: [],
        blocks: {}, blocksByName: {}, blocksArray: [], blocksByStateId: {},
        blockCollisionShapes: { blocks: {}, shapes: {} },
    };
}

test('mergeItemsAndEntities adds modded ids and leaves vanilla untouched', () => {
    const md = fakeMcData();
    md.items[1] = { id: 1, name: 'stone' };        // pretend-vanilla, must survive
    md.items[1].displayName = 'Stone';

    const { items, entities } = mergeItemsAndEntities(md, {
        item: { entries: [{ id: 1, name: 'stone' }, { id: 20000, name: 'create:cogwheel' }] },
        entity: { entries: [{ id: 500, name: 'create:contraption' }] },
    });

    assert.equal(items, 1);    // only the new one
    assert.equal(entities, 1);
    assert.equal(md.items[1].displayName, 'Stone');            // vanilla untouched
    assert.equal(md.itemsByName['create:cogwheel'].id, 20000); // modded resolvable by name
    assert.equal(md.itemsByName['create:cogwheel'].displayName, 'Cogwheel');
    assert.equal(md.entitiesByName['create:contraption'].id, 500);
});

test('mergeBlocks adds blocks, expands blocksByStateId, and merges collision', () => {
    const md = fakeMcData();
    const blocks = [{
        id: 900, name: 'create:andesite_casing',
        minStateId: 1000, maxStateId: 1002, defaultState: 1000,
    }];
    const collision = { newShapes: { 900001: [[0, 0, 0, 1, 1, 1]] }, blocksPatch: { 'create:andesite_casing': 900001 } };

    const { blocks: added } = mergeBlocks(md, blocks, collision);

    assert.equal(added, 1);
    assert.equal(md.blocksByName['create:andesite_casing'].id, 900);
    // every state id in [min,max] resolves back to the block
    for (const sid of [1000, 1001, 1002]) assert.equal(md.blocksByStateId[sid].name, 'create:andesite_casing');
    assert.equal(md.blocksByStateId[999], undefined);
    assert.deepEqual(md.blockCollisionShapes.shapes[900001], [[0, 0, 0, 1, 1, 1]]);
    assert.equal(md.blockCollisionShapes.blocks['create:andesite_casing'], 900001);
});

test('mergeBlocks is idempotent (guards against double injection)', () => {
    const md = fakeMcData();
    const blocks = [{ id: 900, name: 'create:andesite_casing', minStateId: 1000, maxStateId: 1000, defaultState: 1000 }];
    assert.equal(mergeBlocks(md, blocks, null).blocks, 1);
    assert.equal(mergeBlocks(md, blocks, null).blocks, 0); // second call is a no-op
});

function tmpDataDir() {
    const dir = mkdtempSync(join(tmpdir(), 'forge-test-'));
    writeFileSync(join(dir, 'modded_registries.json'), JSON.stringify({
        item: { entries: [{ id: 20000, name: 'create:cogwheel' }] },
        entity: { entries: [] },
    }));
    writeFileSync(join(dir, 'blocks.patch.json'), JSON.stringify([
        { id: 900, name: 'create:andesite_casing', minStateId: 1000, maxStateId: 1000, defaultState: 1000 },
    ]));
    return dir;
}

test('injectModdedData gates items and blocks independently', () => {
    const dir = tmpDataDir();

    const both = fakeMcData();
    injectModdedData(both, dir, { items: true, blocks: true });
    assert.ok(both.itemsByName['create:cogwheel']);
    assert.ok(both.blocksByName['create:andesite_casing']);

    const itemsOnly = fakeMcData();
    injectModdedData(itemsOnly, dir, { items: true, blocks: false });
    assert.ok(itemsOnly.itemsByName['create:cogwheel']);
    assert.equal(itemsOnly.blocksByName['create:andesite_casing'], undefined);

    const neither = fakeMcData();
    injectModdedData(neither, dir, { items: false, blocks: false });
    assert.equal(neither.itemsByName['create:cogwheel'], undefined);
    assert.equal(neither.blocksByName['create:andesite_casing'], undefined);
});

test('injectModdedData no-ops cleanly when data files are absent', () => {
    const empty = mkdtempSync(join(tmpdir(), 'forge-empty-'));
    const md = fakeMcData();
    assert.doesNotThrow(() => injectModdedData(md, empty)); // defaults: items+blocks on
    assert.equal(Object.keys(md.itemsByName).length, 0);
    assert.equal(Object.keys(md.blocksByName).length, 0);
});

// A minimal fake nmp client: EventEmitter + a write spy. It also installs a
// throwing login_plugin_request listener up front — if attachForgeHandshake did
// not removeAllListeners (nmp's auto-NACK), emitting would throw and fail here.
function fakeClient() {
    const client = new EventEmitter();
    client.writes = [];
    client.write = (name, data) => client.writes.push({ name, data });
    client.on('login_plugin_request', () => { throw new Error('nmp auto-NACK should have been removed'); });
    return client;
}

test('attachForgeHandshake replies to S2CModList with a wrapped C2SModListReply', () => {
    const client = fakeClient();
    attachForgeHandshake(client);

    const mods = ['minecraft', 'forge'];
    const channels = [['fml:handshake', '1.2.3']];
    const registries = ['minecraft:block'];
    client.emit('login_plugin_request', {
        messageId: 42,
        data: encodeWrapper('fml:handshake', buildModList(mods, channels, registries)), // disc=1
    });

    assert.equal(client.writes.length, 1);
    const { name, data } = client.writes[0];
    assert.equal(name, 'login_plugin_response');
    assert.equal(data.messageId, 42);
    const { channel, payload: reply } = decodeWrapper(data.data);
    assert.equal(channel, 'fml:handshake');
    const o = { i: 0 };
    assert.equal(readVarInt(reply, o), 2); // C2SModListReply
    const gotMods = [];
    for (let n = readVarInt(reply, o); n > 0; n--) gotMods.push(readString(reply, o));
    assert.deepEqual(gotMods, mods);
    const gotChannels = [];
    for (let n = readVarInt(reply, o); n > 0; n--) gotChannels.push([readString(reply, o), readString(reply, o)]);
    assert.deepEqual(gotChannels, channels);
});

test('attachForgeHandshake ACKs non-modlist requests with C2SAcknowledge', () => {
    const client = fakeClient();
    attachForgeHandshake(client);
    // disc=3 (S2CRegistry) -> bare acknowledge (varint 99)
    const payload = Buffer.concat([writeVarInt(3), writeString('minecraft:block')]);
    client.emit('login_plugin_request', { messageId: 7, data: encodeWrapper('fml:handshake', payload) });

    const { channel, payload: reply } = decodeWrapper(client.writes[0].data.data);
    assert.equal(channel, 'fml:handshake');
    assert.deepEqual([...reply], [99]);
});

test('attachForgeHandshake falls back to a bare NACK on decode error', () => {
    const client = fakeClient();
    attachForgeHandshake(client);
    // missing data -> decodeWrapper throws -> catch writes a data-less NACK
    client.emit('login_plugin_request', { messageId: 5 });
    assert.equal(client.writes.length, 1);
    assert.equal(client.writes[0].name, 'login_plugin_response');
    assert.equal(client.writes[0].data.messageId, 5);
    assert.equal(client.writes[0].data.data, undefined);
});
