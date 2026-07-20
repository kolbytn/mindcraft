import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import minecraftData from 'minecraft-data';
import protodef from 'protodef';

const DEFAULT_FORGE_VERSION = '1.19.2';
const DEFAULT_FML_MARKER = 'FML3';
const HANDSHAKE_CHANNEL = 'fml:handshake';
const DISC_S2C_MODLIST = 1;
const DISC_S2C_REGISTRY = 3;
const DISC_C2S_MODLIST_REPLY = 2;
const DISC_C2S_ACKNOWLEDGE = 99;

const WANTED_REGISTRIES = { 'minecraft:item': 'item', 'minecraft:entity_type': 'entity', 'minecraft:block': 'block' };

const [_readVarInt, _writeVarInt, _sizeOfVarInt] = protodef.types.varint;

export function readVarInt(buf, o) {
    const { value, size } = _readVarInt(buf, o.i);
    o.i += size;
    return value;
}
export function writeVarInt(v) {
    const buf = Buffer.alloc(_sizeOfVarInt(v));
    _writeVarInt(v, buf, 0);
    return buf;
}
export function readString(buf, o) {
    const len = readVarInt(buf, o);
    const s = buf.slice(o.i, o.i + len).toString('utf8');
    o.i += len;
    return s;
}
export function writeString(s) {
    const b = Buffer.from(s, 'utf8');
    return Buffer.concat([writeVarInt(b.length), b]);
}

export function decodeWrapper(data) {
    const o = { i: 0 };
    const channel = readString(data, o);
    const len = readVarInt(data, o);
    return { channel, payload: data.slice(o.i, o.i + len) };
}
export function encodeWrapper(channel, payload) {
    return Buffer.concat([writeString(channel), writeVarInt(payload.length), payload]);
}

export function buildModListReply(payload) {
    const o = { i: 0 };
    readVarInt(payload, o); // skip discriminator
    const mods = readList(payload, o, readString);
    const channels = readList(payload, o, (b, c) => [readString(b, c), readString(b, c)]);
    const registries = readList(payload, o, readString);

    const parts = [writeVarInt(DISC_C2S_MODLIST_REPLY)];
    parts.push(writeVarInt(mods.length)); mods.forEach(m => parts.push(writeString(m)));
    parts.push(writeVarInt(channels.length)); channels.forEach(([n, v]) => parts.push(writeString(n), writeString(v)));
    parts.push(writeVarInt(registries.length)); registries.forEach(r => parts.push(writeString(r), writeString('')));
    return Buffer.concat(parts);
}
function readList(buf, o, readItem) {
    const n = readVarInt(buf, o);
    const out = [];
    for (let k = 0; k < n; k++) out.push(readItem(buf, o));
    return out;
}

function decodeRegistry(payload) {
    const o = { i: 0 };
    readVarInt(payload, o);
    const regName = readString(payload, o);
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

export function attachForgeHandshake(client, opts = {}) {
    const { autoCapture = true, dataPath = './modded_data' } = opts;
    const captured = {};

    client.removeAllListeners('login_plugin_request');
    client.on('login_plugin_request', (packet) => {
        try {
            const { channel, payload } = decodeWrapper(packet.data);
            const disc = payload.length ? payload[0] : -1;

            if (channel === HANDSHAKE_CHANNEL && disc === DISC_S2C_REGISTRY && autoCapture) {
                try {
                    const { regName, entries } = decodeRegistry(payload);
                    const key = WANTED_REGISTRIES[regName];
                    if (key && !captured[key]) {
                        captured[key] = { count: entries.length, entries };
                        console.log(`[forge] auto-captured ${regName}: ${entries.length} entries`);
                    }
                } catch (e) {
                    console.warn('[forge] registry decode failed:', e?.message || e);
                }
            }

            const reply = (channel === HANDSHAKE_CHANNEL && disc === DISC_S2C_MODLIST)
                ? buildModListReply(payload)
                : writeVarInt(DISC_C2S_ACKNOWLEDGE);
            client.write('login_plugin_response', {
                messageId: packet.messageId,
                data: encodeWrapper(HANDSHAKE_CHANNEL, reply)
            });
        } catch (e) {
            console.warn('[forge] handshake handler error:', e?.message || e);
            try { client.write('login_plugin_response', { messageId: packet.messageId }); } catch (_) {}
        }
    });

    if (autoCapture) {
        client.once('success', () => {
            if (Object.keys(captured).length === 0) return;
            const outFile = join(dataPath, 'modded_registries.json');
            // Safe to skip: concurrent bots receive identical registries from the same server
            if (existsSync(outFile)) return;
            try {
                mkdirSync(dataPath, { recursive: true });
                writeFileSync(outFile, JSON.stringify(captured, null, 2));
                console.log(`[forge] wrote auto-captured registries to ${outFile}`);
            } catch (e) {
                console.warn('[forge] failed to write auto-captured registries:', e?.message || e);
            }
        });
    }
}

function prettyName(resourceLocation) {
    return resourceLocation.split(':').pop().split('_')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
function loadJson(path) {
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
}

// Vanilla parser crashes on modded argument types in declare_commands
export function applyPacketResilience(md) {
    const types = md?.protocol?.play?.toClient?.types;
    if (types) types.packet_declare_commands = 'restBuffer';
}

export function mergeItemsAndEntities(md, reg) {
    let items = 0, entities = 0;
    for (const e of reg?.item?.entries || []) {
        if (e?.id == null) continue;
        if (md.items[e.id] !== undefined) continue;
        const it = { id: e.id, name: e.name, displayName: prettyName(e.name), stackSize: 64 };
        md.items[e.id] = it; md.itemsByName[e.name] = it; md.itemsArray?.push(it); items++;
    }
    for (const e of reg?.entity?.entries || []) {
        if (e?.id == null) continue;
        if (md.entities[e.id] !== undefined) continue;
        const en = { id: e.id, internalId: e.id, name: e.name, displayName: prettyName(e.name),
            width: 0.6, height: 1.8, type: 'mob', category: 'Modded' };
        md.entities[e.id] = en; md.entitiesByName[e.name] = en; md.entitiesArray?.push(en); entities++;
    }
    return { items, entities };
}

export function mergeBlocks(md, blocks, collision) {
    if (!blocks || md.__moddedBlocksPatched) return { blocks: 0 };
    md.__moddedBlocksPatched = true;

    let added = 0;
    for (const block of blocks) {
        if (block?.id == null) continue;
        if (md.blocksByName[block.name] !== undefined || md.blocks[block.id] !== undefined) continue;
        md.blocksArray?.push(block);
        md.blocks[block.id] = block;
        md.blocksByName[block.name] = block;
        for (let sid = block.minStateId; sid <= block.maxStateId; sid++) md.blocksByStateId[sid] = block;
        added++;
    }
    if (collision && md.blockCollisionShapes) {
        Object.assign(md.blockCollisionShapes.shapes, collision.newShapes);
        Object.assign(md.blockCollisionShapes.blocks, collision.blocksPatch);
    }
    return { blocks: added };
}

export function injectModdedData(md, dataPath = './modded_data', { items = true, blocks = true } = {}) {
    if (items) try {
        const reg = loadJson(join(dataPath, 'modded_registries.json'));
        if (reg) {
            const { items: ai, entities } = mergeItemsAndEntities(md, reg);
            console.log(`[forge] injected modded registries: +${ai} items, +${entities} entities`);
        }
    } catch (e) { console.warn('[forge] registry injection failed:', e?.message || e); }

    if (blocks) try {
        const blockPatch = loadJson(join(dataPath, 'blocks.patch.json'));
        if (blockPatch) {
            const collision = loadJson(join(dataPath, 'blockCollisionShapes.patch.json'));
            const { blocks: added } = mergeBlocks(md, blockPatch, collision);
            console.log(`[forge] injected modded blocks: +${added}`);
        }
    } catch (e) { console.warn('[forge] block injection failed:', e?.message || e); }
}

// Sync I/O acceptable here — endpoint is called rarely and files are small
export function getModdedStatus(dataPath = './modded_data') {
    const registries = loadJson(join(dataPath, 'modded_registries.json'));
    const blocks = loadJson(join(dataPath, 'blocks.patch.json'));
    const collision = loadJson(join(dataPath, 'blockCollisionShapes.patch.json'));
    return {
        registries_exist: !!registries,
        blocks_exist: !!blocks,
        collision_exist: !!collision,
        items: registries?.item?.entries?.length || 0,
        entities: registries?.entity?.entries?.length || 0,
        blocks_count: Array.isArray(blocks) ? blocks.length : 0,
    };
}

export function applyForgeSupport(options, version, opts = {}) {
    const { dataPath = './modded_data', fmlMarker = DEFAULT_FML_MARKER,
        injectItems = true, injectBlocks = true } = opts;
    const NUL = String.fromCharCode(0);
    options.fakeHost = (options.host || 'localhost') + NUL + (fmlMarker || DEFAULT_FML_MARKER) + NUL;
    try {
        const md = minecraftData(version && version !== 'auto' ? version : DEFAULT_FORGE_VERSION);
        applyPacketResilience(md);
        injectModdedData(md, dataPath, { items: injectItems, blocks: injectBlocks });
    } catch (e) {
        console.warn('[forge] could not patch modded protocol:', e?.message || e);
    }
}
