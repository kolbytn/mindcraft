# tools/modded -- block data extraction for Forge servers

## Getting Started

There are two levels of support. Pick the one you need:

### Just want bots on a Forge server (items + entities)

This is the zero-tool path -- everything happens automatically.

1. Open your `settings.js` file and set `"forge": true` and
   `"minecraft_version": "1.19.2"` (replace with your server's Minecraft
   version if different).
2. Start the bot.
3. You are done. Items and entities from your modpack are automatically captured
   the first time the bot connects to the server. No extra tools or commands
   needed.

### Also want modded block awareness

If you want the bot to recognize modded blocks by name (not just items and
entities), there is a one-time setup. This only needs to be done once per
modpack.

4. Build the StateDumper mod. The source code is in `tools/modded/statedumper/`.
   You need JDK 17 installed. Run `./gradlew build` inside that folder to get
   the jar file. (If you do not want to build it yourself, check the releases
   page for a pre-built jar.)
5. Copy the jar file into your Forge server's `mods/` folder. Start the server
   once -- the mod writes its data file on startup. After the server finishes
   loading, shut it down and remove the jar from `mods/`. The jar is only needed
   for this single run.
6. On your own machine (where you run mindcraft), run this command:
   ```
   node tools/modded/extract.mjs --server-dir /path/to/your/server
   ```
   Replace `/path/to/your/server` with the actual path to the Forge server
   folder that has the `blockstates.json` the mod just wrote.
7. Restart the bot. Modded blocks now resolve by name -- `bot.blockAt(pos)`
   returns the correct modded block name instead of "unknown".

### Checking what is loaded

You can verify everything is working by hitting this endpoint in your browser or
with curl:

```
GET /api/modded-status
```



It returns a JSON object showing whether forge mode is active, which data files
exist, and how many items, blocks, and entities are loaded.

---

## How it works

Items and entities are **auto-captured** from the FML handshake on first bot
connect (set `forge: true` + `minecraft_version`, start a bot -- done). No tools
needed.

These tools handle the **block** data that can't come from the handshake. Blocks
require a one-time server-side dump because chunk parsing needs the exact
block-state table, which only exists inside the JVM's registry.

Run once per modpack, on your own machine, against your own server. The output
goes in `modded_data/` (not committed to this repo).

Verified on **MC 1.19.2 / Forge 43.3.7 (FML3)**. Other Forge modpacks in the
FML2/FML3 era (~MC 1.13--1.19.x) should work with the matching version/marker.
NeoForge (MC 1.20.1+) uses a different handshake and is out of scope.

## Quick start

### 1. Build the StateDumper mod (once)

```
cd tools/modded/statedumper
./gradlew build
```

Requires **JDK 17** (for MC 1.19.2). Produces
`build/libs/statedumper-1.0.0.jar`.

### 2. Dump block states (once per modpack)

- Copy the jar into the server's `mods/` folder.
- Start the server once -- the mod writes `blockstates.json` on startup, then you
  can shut down.
- Remove the jar. Prefer running against a **throwaway copy** of the server.

The mod is read-only -- it reads `Block.BLOCK_STATE_REGISTRY` and registers nothing,
so it can't perturb any ids.

### 3. Extract

```
node tools/modded/extract.mjs --server-dir /path/to/forge-server [--output ./modded_data]
```

This finds the StateDumper output and the auto-captured registries, runs the
converter, and produces `blocks.patch.json` + `blockCollisionShapes.patch.json`
in the output directory.

If it can't find `modded_registries.json`, start a bot with `forge: true` first
(the handshake auto-captures it), then re-run.

### 4. Use

Set in `settings.js`:
```json
"forge": true,
"minecraft_version": "1.19.2",
"forge_data_path": "./modded_data"
```

Start your bots. `bot.blockAt(pos)` returns modded blocks by name.

## Output files

| File | Produced by | Used for |
|------|-------------|----------|
| `modded_registries.json` | Auto-captured on first bot connect | Item + entity name resolution |
| `blocks.patch.json` | `extract.mjs` | Modded blocks resolvable by name |
| `blockCollisionShapes.patch.json` | `extract.mjs` | Modded block collision/dig |

## Files in this directory

- `extract.mjs` -- single command that locates the StateDumper output and runs the
  converter. This is the only tool most users need.
- `convert.cjs` -- turns raw dumps into minecraft-data patch files (called by
  `extract.mjs`).
- `capture_registries.mjs` -- standalone registry capture via FML handshake. Not
  needed in normal use (auto-capture handles this), but available for scripting
  or debugging.
- `statedumper/` -- read-only Forge mod source + gradle build. Dumps block states
  from the JVM registry.

## Extending to other loaders

`src/utils/forge.js` is split into three layers so support for another mod loader
is a small, additive change (this PR ships only the Forge path):

- **(A) Login handshake -- loader-specific / pluggable.** `attachForgeHandshake` +
  the `fakeHost` marker. A new loader supplies its own A-adapter. NeoForge (MC
  1.20.1+) needs a different handshake; Fabric usually needs **no A layer at all**
  because Fabric servers accept vanilla clients.
- **(B) Packet resilience -- shared / loader-agnostic.** `applyPacketResilience(md)`
  (declare_commands passthrough). Reusable as-is.
- **(C) Modded-data injection -- shared / loader-agnostic.** `injectModdedData(md,
  dataPath, { items, blocks })` plus the pure `mergeItemsAndEntities` / `mergeBlocks`.
  Reusable as-is once you have the data files.

A new loader adds: an **A-adapter** (or none, for Fabric) and an **extractor**
that produces the same `modded_registries.json` / `blocks.patch.json` shape. The
StateDumper is Forge-specific; the schema it emits is not. Layers B and C are
already exported for reuse.
