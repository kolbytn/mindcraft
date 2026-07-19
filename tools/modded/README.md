# tools/modded — one-time modded data extraction

These tools generate the **optional** per-modpack data files that let Forge bots
recognize modded items, entities, and blocks by name. They are run **once per
modpack** (on your own machine, against your own server) and produce user data
that is **not** committed to this repo.

If you skip this step entirely, bots still connect and play on a Forge server —
they just see modded content as "unknown". These files add the awareness.

Everything here is modpack-agnostic and version-parameterized. It was verified on
**MC 1.19.2 / Forge 43.3.7 (FML3)**; other Forge
modpacks in the FML2/FML3 era (~MC 1.13–1.19.x) should work with the matching
version/marker. NeoForge (MC 1.20.1+) uses a different handshake and is out of scope.

## What you produce

Place the outputs in the directory named by `settings.forge_data_path`
(default `./modded_data`):

| File | Produced by | Used for |
|------|-------------|----------|
| `modded_registries.json` | `capture_registries.mjs` | item + entity name resolution; block-id cross-check |
| `blocks.patch.json` | `convert.js` | modded blocks resolvable by name |
| `blockCollisionShapes.patch.json` | `convert.js` | modded block collision/dig |

## Steps

1. **Capture the registries** (item/entity/block) from the running server by
   completing the FML handshake:

   ```
   node tools/modded/capture_registries.mjs \
     --host <server> --port <port> --version <mcVersion> --marker FML3 \
     --out modded_data/modded_registries.json
   ```

   This alone is enough for **item/entity** awareness. For block-state fidelity
   (chunks resolving modded blocks), continue.

2. **Dump block states** with the read-only `statedumper/` Forge mod. It registers
   nothing — it only reads `Block.BLOCK_STATE_REGISTRY` on `ServerStartedEvent`,
   so it is safe to add for one start and remove.
   - Build once, in isolation (no need for the modpack's other jars). Set
     `minecraft_version` / `forge_version` in `statedumper/gradle.properties` to
     match your server, then `./gradlew build` → `build/libs/statedumper-1.0.0.jar`.
   - Copy the jar into the server's `mods/` folder, start the server once, then
     remove the jar. It writes `statedump/blockstates.json`.
   - Prefer running against a **throwaway copy** of the server to avoid any
     disruption to your live world.

3. **Convert** the dumps into minecraft-data patch files:

   ```
   node tools/modded/convert.js \
     modded_data/modded_registries.json statedump/blockstates.json modded_data
   ```

   Review `convert-report.json` — vanilla ids should match minecraft-data (it
   flags mismatches, which usually mean the two dumps came from different server
   runs; re-capture both from the same run).

4. Set `"forge": true` and `"forge_data_path": "./modded_data"` in `settings.js`
   and start your bots.

## Files

- `capture_registries.mjs` — handshake registry extractor (reuses the wire codec
  from `src/utils/forge.js`).
- `statedumper/` — read-only Forge mod that dumps block states (source + gradle).
- `convert.js` — turns the two dumps into `blocks.patch.json` +
  `blockCollisionShapes.patch.json`.

## Extending to other loaders

`src/utils/forge.js` is split into three layers so support for another mod loader
is a small, additive change (this PR ships only the Forge path):

- **(A) Login handshake — loader-specific / pluggable.** `attachForgeHandshake` +
  the `fakeHost` marker. A new loader supplies its own A-adapter. NeoForge (MC
  1.20.1+) needs a different handshake; Fabric usually needs **no A layer at all**
  because Fabric servers accept vanilla clients.
- **(B) Packet resilience — shared / loader-agnostic.** `applyPacketResilience(md)`
  (declare_commands passthrough). Reusable as-is.
- **(C) Modded-data injection — shared / loader-agnostic.** `injectModdedData(md,
  dataPath, { items, blocks })` plus the pure `mergeItemsAndEntities` / `mergeBlocks`.
  Reusable as-is once you have the data files.

So a new loader would add only: an **A-adapter** (or none, for Fabric) and an
**extractor** that produces the same `modded_registries.json` / `blocks.patch.json`
shape (the StateDumper mod here is Forge-specific; the schema it emits is not).
Layers B and C are already exported for reuse — nothing in them is Forge-only.
