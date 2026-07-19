#!/usr/bin/env node
'use strict'
/**
 * convert.js
 *
 * Builds prismarine/minecraft-data-compatible "patch" files for a modded
 * Forge block registry (verified on MC 1.19.2 / FML3), from two inputs:
 *
 *   1) modded_registries.json  - captured by decoding the FML handshake
 *      registry-sync packets during a bot connection. Shape:
 *        { block: { count: <int>, entries: [ { id: <int>, name: "<ns:path>" }, ... ] }, ... }
 *      This gives the authoritative BLOCK (not block-STATE) registry id for
 *      every block, in the exact order the running server assigned them.
 *      Used here only for a cross-check (dumpedBlock.id === registryEntry.id)
 *      and as a fallback name source; the state dump below is authoritative
 *      for everything state-related.
 *
 *   2) blockstates.json - produced by the StateDumper Forge mod
 *      (see ../src/main/java/com/mindcraft/statedumper/StateDumper.java),
 *      which reads Block.BLOCK_STATE_REGISTRY directly on the live server.
 *      This is the ONLY source of truth for global block-STATE ids; we do
 *      NOT reimplement Mojang's state-permutation algorithm here - we trust
 *      the JVM-reported `globalId` per state verbatim. See the accompanying
 *      report for why (byte-exact by construction, no risk of an off-by-one
 *      or ordering mismatch versus the real server).
 *
 * Outputs (written next to this script):
 *   - blocks.patch.json            (array, minecraft-data blocks.json schema)
 *   - blockCollisionShapes.patch.json  ({ blocksPatch, newShapes })
 *   - convert-report.json          (diagnostics: counts, warnings, mismatches)
 *
 * Usage:
 *   node convert.js <modded_registries.json> <blockstates.json> [outDir]
 */

const fs = require('fs')
const path = require('path')

function neededBits (value) {
  // mirrors prismarine-chunk's src/pc/common/neededBits.js exactly:
  // 32 - Math.clz32(value)
  return 32 - Math.clz32(value)
}

function stripVanillaNamespace (name) {
  // Vanilla minecraft-data uses bare names ("stone", not "minecraft:stone").
  // Existing mindcraft code (mcdata.js: getBlockName/getBlockId/blocksByName)
  // assumes bare names for anything it already knows about. We preserve that
  // convention for the "minecraft" namespace only, and use the full
  // "modid:path" form for every modded block, which:
  //   (a) guarantees uniqueness (two mods can both have a block called
  //       "generator" - bare names would collide),
  //   (b) matches how essentially all modded MC tooling (JEI, JADE/WAILA,
  //       /give autocompletion) displays block identifiers, so LLM agent
  //       prompts referencing "createmod:cogwheel" will be unambiguous.
  if (name.startsWith('minecraft:')) return name.slice('minecraft:'.length)
  return name
}

function toDisplayName (bareOrNamespaced) {
  const path = bareOrNamespaced.includes(':') ? bareOrNamespaced.split(':')[1] : bareOrNamespaced
  return path
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function main () {
  const [, , registriesPath, stateDumpPath, outDirArg] = process.argv
  if (!registriesPath || !stateDumpPath) {
    console.error('Usage: node convert.js <modded_registries.json> <blockstates.json> [outDir]')
    process.exit(1)
  }
  const outDir = outDirArg || __dirname

  const registries = JSON.parse(fs.readFileSync(registriesPath, 'utf8'))
  const stateDump = JSON.parse(fs.readFileSync(stateDumpPath, 'utf8'))

  const registryById = new Map()
  const registryByName = new Map()
  for (const e of (registries.block?.entries || [])) {
    registryById.set(e.id, e.name)
    registryByName.set(e.name, e.id)
  }

  const report = {
    totalBlocksInDump: stateDump.length,
    totalBlocksInRegistrySnapshot: registries.block?.entries?.length ?? null,
    idMismatches: [],
    missingFromRegistrySnapshot: [],
    missingFromDump: [],
    propertyOrderWarnings: [],
    maxGlobalStateId: 0,
    totalStates: 0
  }

  // Cross-check: every block the registry snapshot knows about should also
  // appear in the state dump, and vice versa. A mismatch here usually means
  // the two dumps were taken from different server starts / different mod
  // sets (registry ids can shift if the mod list or Forge's registration
  // order changes between restarts) - if this fires, STOP and re-capture
  // both files from the same server run.
  const dumpByName = new Map(stateDump.map(b => [b.name, b]))
  for (const [id, name] of registryById) {
    if (!dumpByName.has(name)) report.missingFromDump.push({ id, name })
  }
  for (const b of stateDump) {
    if (!registryByName.has(b.name)) report.missingFromRegistrySnapshot.push({ id: b.id, name: b.name })
    else if (registryByName.get(b.name) !== b.id) {
      report.idMismatches.push({ name: b.name, registryId: registryByName.get(b.name), dumpId: b.id })
    }
  }

  const blocksPatch = []
  const collisionBlocksPatch = {}
  const newShapes = {}
  let nextShapeId = 900000 // arbitrary high range, guaranteed not to collide
                           // with vanilla minecraft-data shape ids (which are
                           // small sequential ints starting at 0). Verify
                           // against the live blockCollisionShapes.json max
                           // id before using in production - see report.
  const FULL_CUBE_AABB = [[0, 0, 0, 1, 1, 1]]

  function shapeIdFor (aabbs) {
    // Dedupe identical shapes (very common: most modded solid blocks are
    // plain full cubes) so we don't create thousands of redundant entries.
    const key = JSON.stringify(aabbs)
    if (!shapeIdFor._cache) shapeIdFor._cache = new Map()
    if (shapeIdFor._cache.has(key)) return shapeIdFor._cache.get(key)
    const id = nextShapeId++
    newShapes[id] = aabbs
    shapeIdFor._cache.set(key, id)
    return id
  }

  for (const block of stateDump) {
    if (block.name.startsWith('minecraft:')) continue // never override vanilla entries already in minecraft-data

    const states = [...block.states].sort((a, b) => a.globalId - b.globalId)
    if (states.length === 0) {
      report.propertyOrderWarnings.push({ block: block.name, issue: 'no states in dump, skipped' })
      continue
    }

    // Sanity check: globalIds for one block's states must be contiguous.
    // This should always hold because Bootstrap-style registration assigns
    // ids to every possible permutation of one block before moving to the
    // next block, with no gaps. If it doesn't hold, something is wrong with
    // the dump (or Forge's behavior differs from vanilla in a way we didn't
    // anticipate) - flag loudly rather than silently emitting a corrupt
    // minStateId/maxStateId range.
    const minStateId = states[0].globalId
    const maxStateId = states[states.length - 1].globalId
    const contiguous = (maxStateId - minStateId + 1) === states.length &&
      states.every((s, i) => s.globalId === minStateId + i)
    if (!contiguous) {
      report.propertyOrderWarnings.push({
        block: block.name,
        issue: 'non-contiguous globalId range - minStateId/maxStateId range will be WRONG, blocksByStateId patch skipped for this block',
        states: states.map(s => s.globalId)
      })
      continue
    }

    const defaultIdx = states.findIndex(s => s.default)
    const defaultState = defaultIdx >= 0 ? minStateId + defaultIdx : minStateId

    // Build the minecraft-data "states" (property) schema: alphabetical by
    // name (matches the order the dump mod already sorted `properties` in,
    // which itself mirrors Mojang's ImmutableSortedMap<String, Property<?>>
    // convention - see report section 2). Values list per property is taken
    // from the dump's declared possible-values order.
    const propsSchema = (block.properties || []).map(p => ({
      name: p.name,
      type: p.values.length === 2 && p.values.includes('true') && p.values.includes('false') ? 'bool' : 'enum',
      num_values: p.values.length,
      values: p.values
    }))

    // Verification: mixed-radix decode (last property varies fastest, exactly
    // matching prismarine-block's fromStateId decode loop) using propsSchema
    // must reproduce every state's recorded properties map. If it doesn't,
    // we keep the block (blocksByStateId / name-resolution / collision are
    // still exact, since those come straight from globalId) but warn that
    // PROPERTY VALUES surfaced via bot.blockAt(pos).getProperties() may be
    // wrong for this block - cosmetic only, not a chunk-parsing correctness
    // issue.
    let verifyOk = true
    for (let i = 0; i < states.length; i++) {
      let data = i
      const decoded = {}
      for (let pi = propsSchema.length - 1; pi >= 0; pi--) {
        const prop = propsSchema[pi]
        decoded[prop.name] = prop.values[data % prop.num_values]
        data = Math.floor(data / prop.num_values)
      }
      const actual = states[i].properties || {}
      for (const k of Object.keys(actual)) {
        if (decoded[k] !== actual[k]) { verifyOk = false; break }
      }
      if (!verifyOk) break
    }
    if (!verifyOk && propsSchema.length > 0) {
      report.propertyOrderWarnings.push({
        block: block.name,
        issue: 'mixed-radix property reconstruction did not match dump - property VALUES may be wrong when decoded generically; name/id/collision unaffected'
      })
    }

    const bareName = stripVanillaNamespace(block.name)

    const blockEntry = {
      id: block.id,
      name: bareName,
      displayName: toDisplayName(bareName),
      hardness: 1.5,          // best-effort default; StateDumper does not
      resistance: 6,          // reliably capture these across arbitrary
      stackSize: 64,          // modded Block subclasses (see report) -
      diggable: true,         // override later from a real datapack/loot
      material: (states[defaultIdx >= 0 ? defaultIdx : 0].material || 'default'),
      transparent: !(states[defaultIdx >= 0 ? defaultIdx : 0].solidFullCube),
      emitLight: states[defaultIdx >= 0 ? defaultIdx : 0].lightEmission || 0,
      filterLight: states[defaultIdx >= 0 ? defaultIdx : 0].solidFullCube ? 15 : 0,
      minStateId,
      maxStateId,
      defaultState,
      states: propsSchema,
      drops: [],
      boundingBox: states[defaultIdx >= 0 ? defaultIdx : 0].solidFullCube ? 'block' : 'empty'
    }
    blocksPatch.push(blockEntry)

    report.totalStates += states.length
    report.maxGlobalStateId = Math.max(report.maxGlobalStateId, maxStateId)

    // Collision shapes, indexed by metadata offset (globalId - minStateId),
    // in NATURAL globalId order - this indexing is correct independent of
    // whether the propsSchema/mixed-radix reconstruction above matched,
    // because prismarine-block reads it via
    //   registry.blockCollisionShapes.blocks[block.name][metadata]
    // where metadata IS (stateId - minStateId), i.e. exactly our `i` index.
    const perStateShapeIds = states.map(s => {
      const aabbs = (s.collisionAABBs && s.collisionAABBs.length > 0)
        ? s.collisionAABBs
        : (s.solidFullCube ? FULL_CUBE_AABB : [])
      return shapeIdFor(aabbs)
    })
    collisionBlocksPatch[bareName] = perStateShapeIds.length === 1 ? perStateShapeIds[0] : perStateShapeIds
  }

  fs.writeFileSync(path.join(outDir, 'blocks.patch.json'), JSON.stringify(blocksPatch, null, 2))
  fs.writeFileSync(path.join(outDir, 'blockCollisionShapes.patch.json'), JSON.stringify({
    blocksPatch: collisionBlocksPatch,
    newShapes
  }, null, 2))

  const requiredGlobalBits = neededBits(report.maxGlobalStateId)
  report.requiredGlobalBitsPerBlock = requiredGlobalBits
  report.warningIfBitsExceed16 = requiredGlobalBits > 16
    ? `WARNING: max global state id ${report.maxGlobalStateId} needs ${requiredGlobalBits} bits. prismarine-chunk computes this dynamically from mcData.blocks (see report section 3), so it WILL adapt automatically once this patch is merged - but double check no OTHER assumption in node-minecraft-protocol/prismarine-chunk hardcodes 16 bits for direct-palette sections.`
    : `OK: fits in ${requiredGlobalBits} bits (<=16), matches prismarine-chunk's existing default.`

  fs.writeFileSync(path.join(outDir, 'convert-report.json'), JSON.stringify(report, null, 2))

  console.log(`Wrote ${blocksPatch.length} block entries / ${report.totalStates} states.`)
  console.log(`Max global state id: ${report.maxGlobalStateId} (${requiredGlobalBits} bits needed).`)
  console.log(`Warnings: ${report.propertyOrderWarnings.length}, id mismatches: ${report.idMismatches.length}, missing-from-dump: ${report.missingFromDump.length}, missing-from-registry: ${report.missingFromRegistrySnapshot.length}`)
  console.log('See convert-report.json for details.')
}

main()
