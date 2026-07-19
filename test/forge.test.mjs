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

test('VarInt golden bytes (300 <-> ac 02)', () => {
    assert.equal(readVarInt(Buffer.from([0xac, 0x02]), { i: 0 }), 300);
    assert.deepEqual([...writeVarInt(300)], [0xac, 0x02]);
    assert.deepEqual([...writeVarInt(0)], [0x00]);
    assert.deepEqual([...writeVarInt(127)], [0x7f]);
});

test('String golden bytes (length-prefix + UTF-8)', () => {
    assert.deepEqual([...writeString('AB')], [0x02, 0x41, 0x42]);
    assert.equal(readString(Buffer.from([0x02, 0x41, 0x42]), { i: 0 }), 'AB');
});

test('loginwrapper golden bytes (channel + len + payload)', () => {
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
    md.items[1] = { id: 1, name: 'stone' };
    md.items[1].displayName = 'Stone';

    const { items, entities } = mergeItemsAndEntities(md, {
        item: { entries: [{ id: 1, name: 'stone' }, { id: 20000, name: 'create:cogwheel' }] },
        entity: { entries: [{ id: 500, name: 'create:contraption' }] },
    });

    assert.equal(items, 1);
    assert.equal(entities, 1);
    assert.equal(md.items[1].displayName, 'Stone');
    assert.equal(md.itemsByName['create:cogwheel'].id, 20000);
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
    for (const sid of [1000, 1001, 1002]) assert.equal(md.blocksByStateId[sid].name, 'create:andesite_casing');
    assert.equal(md.blocksByStateId[999], undefined);
    assert.deepEqual(md.blockCollisionShapes.shapes[900001], [[0, 0, 0, 1, 1, 1]]);
    assert.equal(md.blockCollisionShapes.blocks['create:andesite_casing'], 900001);
});

test('mergeBlocks is idempotent (guards against double injection)', () => {
    const md = fakeMcData();
    const blocks = [{ id: 900, name: 'create:andesite_casing', minStateId: 1000, maxStateId: 1000, defaultState: 1000 }];
    assert.equal(mergeBlocks(md, blocks, null).blocks, 1);
    assert.equal(mergeBlocks(md, blocks, null).blocks, 0);
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
    assert.doesNotThrow(() => injectModdedData(md, empty));
    assert.equal(Object.keys(md.itemsByName).length, 0);
    assert.equal(Object.keys(md.blocksByName).length, 0);
});

function fakeClient() {
    const client = new EventEmitter();
    client.writes = [];
    client.write = (name, data) => client.writes.push({ name, data });
    // nmp installs an auto-NACK handler; if attachForgeHandshake doesn't remove it, this throws
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
        data: encodeWrapper('fml:handshake', buildModList(mods, channels, registries)),
    });

    assert.equal(client.writes.length, 1);
    const { name, data } = client.writes[0];
    assert.equal(name, 'login_plugin_response');
    assert.equal(data.messageId, 42);
    const { channel, payload: reply } = decodeWrapper(data.data);
    assert.equal(channel, 'fml:handshake');
    const o = { i: 0 };
    assert.equal(readVarInt(reply, o), 2);
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
    const payload = Buffer.concat([writeVarInt(3), writeString('minecraft:block')]);
    client.emit('login_plugin_request', { messageId: 7, data: encodeWrapper('fml:handshake', payload) });

    const { channel, payload: reply } = decodeWrapper(client.writes[0].data.data);
    assert.equal(channel, 'fml:handshake');
    assert.deepEqual([...reply], [99]);
});

test('attachForgeHandshake falls back to a bare NACK on decode error', () => {
    const client = fakeClient();
    attachForgeHandshake(client);
    client.emit('login_plugin_request', { messageId: 5 });
    assert.equal(client.writes.length, 1);
    assert.equal(client.writes[0].name, 'login_plugin_response');
    assert.equal(client.writes[0].data.messageId, 5);
    assert.equal(client.writes[0].data.data, undefined);
});
