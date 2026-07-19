#!/usr/bin/env node
/**
 * capture_registries.mjs
 *
 * One-time extractor (step 1 of the tools/modded workflow). Connects to a
 * running modded Forge server, completes the FML handshake, and decodes the
 * S2CRegistry (discriminator 3) snapshots the server pushes, writing:
 *
 *   modded_registries.json  -> { item, entity, block: { count, entries:[{id,name}] } }
 *
 * That file feeds both src/utils/forge.js (item/entity name resolution) and
 * convert.js (block-id cross-check / fallback names).
 *
 * Reuses the SAME wire codec + mod-list reply as the runtime module
 * (src/utils/forge.js) so there is one implementation to trust.
 *
 * VERIFIED on Minecraft 1.19.2 / FML3. The decoded ForgeRegistry snapshot layout
 * ([bool hasSnapshot][VarInt count][count x (ResourceLocation name, VarInt id)])
 * held for that server; other Forge versions may frame it differently. Sanity
 * check: vanilla ids must line up with minecraft-data — convert.js reports any
 * mismatch, and NeoForge (MC 1.20.1+) is out of scope.
 *
 * Usage:
 *   node tools/modded/capture_registries.mjs \
 *     --host <host> --port <port> --version <mcVersion> [--marker FML3] \
 *     [--username RegBot] [--out modded_registries.json]
 */

import mc from 'minecraft-protocol';
import { writeFileSync } from 'fs';
import {
    readVarInt, readString, decodeWrapper, encodeWrapper, writeVarInt, buildModListReply,
} from '../../src/utils/forge.js';

function arg(name, fallback) {
    const i = process.argv.indexOf('--' + name);
    return i !== -1 ? process.argv[i + 1] : fallback;
}

const host = arg('host', '127.0.0.1');
const port = Number(arg('port', '25565'));
const version = arg('version', '1.19.2');
const marker = arg('marker', 'FML3');
const username = arg('username', 'RegBot');
const outPath = arg('out', 'modded_registries.json');
const NUL = String.fromCharCode(0);

// Forge registry name -> the key we store it under in modded_registries.json.
const WANTED = { 'minecraft:item': 'item', 'minecraft:entity_type': 'entity', 'minecraft:block': 'block' };
const result = {};

// Decode one S2CRegistry payload: [VarInt disc=3][RL regName][bool hasSnapshot]
// [VarInt count][count x (RL name, VarInt id)]. We only read the id map (the
// part we need); any trailing snapshot fields are ignored.
function decodeRegistry(payload) {
    const o = { i: 0 };
    readVarInt(payload, o);                 // discriminator (3)
    const regName = readString(payload, o); // e.g. "minecraft:item"
    const hasSnapshot = payload[o.i++];
    if (!hasSnapshot) return { regName, entries: [] };
    const count = readVarInt(payload, o);
    const entries = [];
    for (let k = 0; k < count; k++) {
        const name = readString(payload, o);
        const id = readVarInt(payload, o);
        entries.push({ id, name });
    }
    return { regName, entries };
}

const client = mc.createClient({
    host, port, username, version, auth: 'offline', keepAlive: false,
    fakeHost: host + NUL + marker + NUL,
});

client.removeAllListeners('login_plugin_request');
client.on('login_plugin_request', (packet) => {
    const { channel, payload } = decodeWrapper(packet.data);
    const disc = payload.length ? payload[0] : -1;
    if (channel === 'fml:handshake' && disc === 3) {
        try {
            const { regName, entries } = decodeRegistry(payload);
            const key = WANTED[regName];
            if (key && !result[key]) {
                result[key] = { count: entries.length, entries };
                console.log(`captured ${regName}: ${entries.length} entries`);
            }
        } catch (e) { console.warn('registry decode failed:', e.message); }
    }
    const reply = (channel === 'fml:handshake' && disc === 1) ? buildModListReply(payload) : writeVarInt(99);
    client.write('login_plugin_response', { messageId: packet.messageId, data: encodeWrapper('fml:handshake', reply) });
});

function finish() {
    writeFileSync(outPath, JSON.stringify(result, null, 2));
    console.log(`wrote ${outPath} (${Object.keys(result).join(', ') || 'nothing captured'})`);
    process.exit(0);
}

client.on('success', () => { console.log('reached PLAY state'); setTimeout(finish, 500); });
client.on('error', (e) => console.error('error:', e.message));
setTimeout(() => { console.warn('timeout'); finish(); }, 20000);
