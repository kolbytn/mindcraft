/**
 * Optional support for connecting Mineflayer bots to modded Forge servers.
 *
 * A vanilla Mineflayer client is rejected by Forge modpack servers. This module
 * makes the bot look like a Forge client and survive modded content in 3 layers:
 *   A. login handshake       — spoof FML (echo the mod list, ACK the rest).
 *                              LOADER-SPECIFIC; see attachForgeHandshake.
 *   B. packet resilience     — pass modded PLAY packets the vanilla parser can't
 *                              read through untouched. SHARED; applyPacketResilience.
 *   C. modded-data injection — inject modpack registries into minecraft-data so
 *                              items/entities/blocks resolve by name. SHARED;
 *                              injectModdedData.
 * B and C are loader-agnostic and exported independently, so a future loader
 * (e.g. NeoForge) only needs its own A-adapter + data extractor — see
 * "Extending to other loaders" in tools/modded/README.md. (Fabric usually needs
 * no A layer at all: it accepts vanilla clients.)
 *
 * Everything here is gated behind `settings.forge`; when it is false this module
 * is never imported-into-effect and behavior is unchanged.
 *
 * WARNING — process-wide singleton mutation: layers B and C mutate the memoized
 * minecraft-data object that `minecraftData(version)` returns process-wide
 * (declare_commands -> restBuffer, plus injected registries/blocks). Every bot on
 * the same version in this process shares it. Do NOT mix forge and non-forge bots
 * (or different modpacks) in one process/version — run them in separate processes.
 *
 * SCOPE / VERSION GENERALITY: the handshake logic (echo S2CModList, ACK the rest)
 * is the same across the FML2/FML3 Forge era (~MC 1.13–1.19.x); the only thing
 * that differs is the address marker, which is configurable (`fmlMarker`, default
 * "FML3"). The Minecraft version is taken from settings, not hardcoded. This was
 * VERIFIED on Minecraft 1.19.2 (FML3); other versions in that range should work
 * with the matching marker but are untested. NeoForge (MC 1.20.1+) uses a
 * different handshake and is out of scope.
 *
 * Two entry points, both called from src/utils/mcdata.js `initBot()`:
 *   applyForgeSupport(options, version, opts)  — BEFORE createBot()  (layers A+B+C)
 *   attachForgeHandshake(client)               — AFTER  createBot()  (layer A)
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import minecraftData from 'minecraft-data';
import protodef from 'protodef';

// Last-resort minecraft-data version if settings.minecraft_version is unset/"auto".
// Forge servers can't be reliably version-auto-detected, so set it explicitly.
const DEFAULT_FORGE_VERSION = '1.19.2';
const DEFAULT_FML_MARKER = 'FML3';
const HANDSHAKE_CHANNEL = 'fml:handshake';
// FML handshake discriminators (from Forge NetworkInitialization/HandshakeMessages):
//   1 = S2CModList (server -> client), 2 = C2SModListReply, 99 = C2SAcknowledge.
const DISC_S2C_MODLIST = 1;
const DISC_C2S_MODLIST_REPLY = 2;
const DISC_C2S_ACKNOWLEDGE = 99;

// --- FML binary primitives (via protodef) ------------------------------------
// Forge frames payloads with standard Minecraft VarInt + length-prefixed UTF-8
// strings. We delegate varint encoding to protodef (the same library
// minecraft-protocol uses internally) and wrap with cursor-style interface.

const [_readVarInt, _writeVarInt, _sizeOfVarInt] = protodef.types.varint;

// Thin wrappers matching the cursor-object interface used by decodeWrapper/buildModListReply.
// Delegates to protodef (the same varint impl minecraft-protocol uses internally).
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

// A fml:loginwrapper envelope is [String channel][VarInt payloadLen][payload];
// the inner payload is [VarInt discriminator][message fields].
export function decodeWrapper(data) {
    const o = { i: 0 };
    const channel = readString(data, o);
    const len = readVarInt(data, o);
    return { channel, payload: data.slice(o.i, o.i + len) };
}
export function encodeWrapper(channel, payload) {
    return Buffer.concat([writeString(channel), writeVarInt(payload.length), payload]);
}

// --- Handshake -------------------------------------------------------------

// Reply to S2CModList by echoing the server's mod, channel and registry lists
// back as C2SModListReply, so the server accepts us as a matching Forge client.
// Registries are acked with an empty hash marker (""), which the server tolerates.
export function buildModListReply(payload) {
    const o = { i: 0 };
    readVarInt(payload, o); // discriminator (1)
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

/**
 * Complete the FML handshake. node-minecraft-protocol auto-NACKs login plugin
 * requests by default; we replace that listener with one that decodes the
 * fml:loginwrapper envelope and replies with a real C2SModListReply to the mod
 * list, or a bare C2SAcknowledge to everything else.
 */
export function attachForgeHandshake(client) {
    // Must remove-all, not add: nmp installs its own auto-NACK login_plugin_request
    // handler, and two responders would each send a login_plugin_response for the
    // same messageId. We fully replace it with ours. Do not "simplify" to .on().
    client.removeAllListeners('login_plugin_request');
    client.on('login_plugin_request', (packet) => {
        try {
            const { channel, payload } = decodeWrapper(packet.data);
            const disc = payload.length ? payload[0] : -1;
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
}

// --- minecraft-data patching (pre-createBot) -------------------------------

function prettyName(resourceLocation) {
    return resourceLocation.split(':').pop().split('_')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
function loadJson(path) {
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
}

// [Layer B — loader-agnostic] Packet resilience. Modded servers describe brigadier
// commands using argument types the vanilla parser doesn't know, which crashes it.
// Pass declare_commands through as a raw buffer instead; mineflayer doesn't need
// the command tree. (Pairs with the minecraft-protocol chat.js guard shipped as a
// patch-package patch.) Exported so a future non-Forge loader can reuse it.
export function applyPacketResilience(md) {
    const types = md?.protocol?.play?.toClient?.types;
    if (types) types.packet_declare_commands = 'restBuffer';
}

// Merge modded item/entity registries into a minecraft-data object so bots
// recognize modded content by name. Pure (no I/O) and exported for testing.
// `reg` is the parsed modded_registries.json. Existing (vanilla) ids are kept.
export function mergeItemsAndEntities(md, reg) {
    let items = 0, entities = 0;
    for (const e of reg?.item?.entries || []) {
        if (e?.id == null) continue;                 // skip malformed entries
        if (md.items[e.id] !== undefined) continue;
        const it = { id: e.id, name: e.name, displayName: prettyName(e.name), stackSize: 64 };
        md.items[e.id] = it; md.itemsByName[e.name] = it; md.itemsArray?.push(it); items++;
    }
    for (const e of reg?.entity?.entries || []) {
        if (e?.id == null) continue;                 // skip malformed entries
        if (md.entities[e.id] !== undefined) continue;
        const en = { id: e.id, internalId: e.id, name: e.name, displayName: prettyName(e.name),
            width: 0.6, height: 1.8, type: 'mob', category: 'Modded' };
        md.entities[e.id] = en; md.entitiesByName[e.name] = en; md.entitiesArray?.push(en); entities++;
    }
    return { items, entities };
}

// Merge modded blocks + per-state collision shapes so chunks resolve modded
// blocks by name. Expanding blocksByStateId per state also lets prismarine-chunk
// derive the correct palette bit-width from the real max stateId (modded worlds
// exceed the vanilla 16-bit assumption). Pure (no I/O) and exported for testing.
export function mergeBlocks(md, blocks, collision) {
    if (!blocks || md.__moddedBlocksPatched) return { blocks: 0 };
    md.__moddedBlocksPatched = true;

    let added = 0;
    for (const block of blocks) {
        if (block?.id == null) continue;             // skip malformed entries
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

// [Layer C — loader-agnostic] Read the modpack data files from `dataPath` and
// merge them in. Each file is optional and best-effort; a missing/malformed file
// is skipped, not fatal. `items` and `blocks` gate the two halves independently
// (blocks is the heavier one — a large data file). Exported so a future non-Forge
// loader can reuse it with its own extracted data.
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

/**
 * Prepare a Forge connection. Call BEFORE createBot(). Orchestrates the three
 * layers (see file header):
 *   A. fakeHost marker       — loader-specific (here: FML).
 *   B. packet resilience     — shared (applyPacketResilience).
 *   C. modded-data injection — shared (injectModdedData), each half toggleable.
 *
 * `version` is the Minecraft version from settings. `opts`:
 *   { dataPath, fmlMarker, injectItems = true, injectBlocks = true }.
 * `fmlMarker` selects the FML era ("FML3" ~1.17-1.19.x, "FML2" ~1.13-1.16).
 * Injection is best-effort: missing/malformed files are skipped with a warning
 * and the bot still connects (just with less modded awareness).
 */
export function applyForgeSupport(options, version, opts = {}) {
    const { dataPath = './modded_data', fmlMarker = DEFAULT_FML_MARKER,
        injectItems = true, injectBlocks = true } = opts;
    // Forge keys the handshake off a null-delimited "<host>NUL<marker>NUL" string
    // appended to the host; the two separators must be NUL bytes.
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
