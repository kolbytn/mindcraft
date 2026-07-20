# Optional support for modded Forge servers

Opt-in code path that lets mindcraft bots connect to and play on **modded Forge**
worlds. Entirely behind `settings.forge` -- **with `forge: false` (the default)
nothing changes.**

## Problem

Mineflayer bots are vanilla-protocol clients. On a Forge modpack server:

1. **Can't join.** Forge requires the FML login handshake; vanilla clients are
   rejected before reaching the world.
2. **Can't understand it.** Modded blocks, items, and entities aren't in
   `minecraft-data`, so the world reads as "unknown" and some modded PLAY packets
   crash the vanilla parser.

## Fix

Three layers, all in `src/utils/forge.js`, gated behind `settings.forge`:

| Layer | What | Scope |
|-------|------|-------|
| A - Login handshake | Complete FML handshake, echo mod list, capture item/entity registries | Forge-specific |
| B - Packet resilience | Pass unparseable modded packets (`declare_commands`) as raw buffer | Loader-agnostic |
| C - Data injection | Merge modded items/entities/blocks into `minecraft-data` at startup | Loader-agnostic |

B and C are reusable by future loaders (NeoForge, Fabric). This PR ships only
the Forge path.

## UX

**Minimal (items + entities):** Set `forge: true` and an explicit
`minecraft_version` in settings, start a bot. Items and entities are
auto-captured from the FML handshake on first connect -- zero manual steps.

**Full (+ blocks):** Same as above, plus:
1. Drop the StateDumper jar in the server's `mods/` folder, start once, remove.
2. Run `node tools/modded/extract.mjs --server-dir /path/to/server`.

Done. `bot.blockAt(pos)` now returns modded blocks by name.

## What changed

| File | Change |
|------|--------|
| `src/utils/forge.js` (new) | All forge logic: handshake, auto-capture, codec, injection, `/api/modded-status` helper |
| `src/utils/mcdata.js` | One import + two `if (settings.forge)` calls in `initBot()` |
| `src/mindcraft/mindserver.js` | `GET /api/modded-status` endpoint, passes `forge_auto_capture` to handshake |
| `settings.js` | `forge`, `forge_fml_marker`, `forge_data_path`, `forge_inject_items`, `forge_inject_blocks`, `forge_auto_capture` |
| `patches/minecraft-protocol+1.66.2.patch` | One-line guard in `declare_commands` listener (patch-package) |
| `test/forge.test.mjs` | 17 unit tests (wire codec, handshake, registry/block injection) |
| `tools/modded/` (new) | `extract.mjs` (single block-extraction command), `convert.cjs`, `capture_registries.mjs`, StateDumper mod source, README |

## How it's gated

Both entry points are `if (settings.forge)` in `initBot()`. No new runtime
dependencies. When forge is off, `initBot()` is byte-for-byte equivalent.

## Settings reference

| Key | Default | Purpose |
|-----|---------|---------|
| `forge` | `false` | Master switch |
| `forge_fml_marker` | `"FML3"` | `FML2` for ~1.13-1.16, `FML3` for ~1.17-1.19.x |
| `forge_data_path` | `"./modded_data"` | Directory for extracted registry/block data |
| `forge_inject_items` | `true` | Merge modded items/entities (no-ops if data absent) |
| `forge_inject_blocks` | `true` | Merge modded blocks (no-ops if data absent) |
| `forge_auto_capture` | `true` | Auto-save item/entity registries from FML handshake |

## Testing & how to review

Tiered -- a reviewer never needs a modpack server:

1. **Zero-regression when off.** The feature is inert unless `settings.forge` is
   true. Any normal (vanilla/Paper) bot exercises the unchanged path.
2. **17 unit tests (no server needed).** `node --test test/forge.test.mjs` covers
   the protodef-based wire codec (round-trip + golden-byte), handshake reply/ACK
   via mock client, and registry/block injection (modded ids added, vanilla
   untouched, `blocksByStateId` expanded).
3. **End-to-end (evidence, not required to reproduce).** Verified against a real
   Forge MC 1.19.2 / Forge 43.3.7 modpack server: bots connect and stay online,
   chat and auto-defend, read modded blocks by name, modded items appear in
   inventory by name.
4. **Style/footprint.** ESM, no new dependencies, modded specifics confined to
   `src/utils/forge.js` + `tools/modded/`.

## Reviewer checklist

- [ ] `mcdata.js` diff is just an import + two `if (settings.forge)` calls
- [ ] `settings.forge` defaults to `false`; all `forge_*` keys have sane defaults
- [ ] `src/utils/forge.js` reads cleanly; FML binary codec uses protodef for varints
- [ ] `node --test test/forge.test.mjs` passes (17 tests)
- [ ] Patch file version (`minecraft-protocol+1.66.2`) matches installed dep
- [ ] No new runtime dependencies
- [ ] `GET /api/modded-status` returns expected shape
- [ ] Modded data files are treated as optional, user-generated, and uncommitted

## Scope & caveats

- **Version-parameterized, verified on 1.19.2.** The handshake is identical across
  the FML2/FML3 era (~MC 1.13-1.19.x); the marker is configurable. Only MC 1.19.2
  / FML3 is tested. **NeoForge (1.20.1+)** is a different handshake and out of scope.
- **Vanilla-protocol bots.** Bots can chat, move, follow, fight, mine/build vanilla
  blocks and recognize modded content by name, but cannot operate mod machines.
- **Known non-fatal log noise.** `entity_metadata` `PartialReadError` can log
  (modded entity NBT; protodef skips the packet). Modded dig-time estimates are
  approximate.
- **Per-modpack data isn't committed.** The `modded_data/` files are user-generated
  for a specific modpack via `tools/modded`.

## Open question — UX for block extraction

Items and entities are fully automatic (captured during the FML handshake).
Blocks still require a one-time server-side dump + a CLI command. I'm not sure
this is the simplest it can be — if you have ideas for streamlining this
further, I'd love to hear them.

## Extending to other loaders

`forge.js` is split so adding another loader is additive: (A) is
loader-specific/pluggable, (B) and (C) are loader-agnostic and exported. A new
loader adds an A-adapter + data extractor, reuses B and C unchanged. NeoForge
needs a different A; Fabric usually needs no A (accepts vanilla clients).
