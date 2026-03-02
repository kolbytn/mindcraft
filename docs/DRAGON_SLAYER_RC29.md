# Dragon Slayer RC29 — Autonomous Ender Dragon System

> **Status: Live** — DragonSlayer is running on local Windows PC (RTX 3090, `sweaterdog/andy-4:q8_0` via Ollama) connected to Paper 1.21.11 on AWS EC2. RC29 persistent state saving active. MindServer HUD: `http://localhost:8080`.

## Executive Summary

RC29 upgrades Mindcraft's dragon progression system from a fragile single-run pipeline into a **persistent, death-surviving, restart-resilient autonomous Ender Dragon slayer**.

Key improvements:
- **Persistent state** (`dragon_progress.json`) survives crashes, restarts, and deaths via atomic JSON writes
- **Smart orchestrator** with exponential backoff (5 retries per chunk), death recovery, gear re-acquisition
- **Dimension awareness** — tracks overworld/nether/end transitions
- **Pre-chunk preparation** — proactive food stockpiling, gear checks, inventory management
- **`!beatMinecraft` command** — single-command alias for the full autonomous run
- **Milestone tracking** — records highest resource counts ever achieved (not just current inventory)

---

## New Files

### `src/agent/library/dragon_progress.js` (~360 lines)
Persistent Dragon Progression state machine.

| Feature | Detail |
|---------|--------|
| **State schema** | version, chunks status map (6 chunks), coords (7 named positions), milestones (7 items), stats (deaths, retries, dimension), dragonFight state |
| **Persistence** | Atomic `.tmp` + `renameSync` pattern (same as `history.js` RC27) |
| **Corruption recovery** | Renames corrupted save to `.corrupted.<timestamp>`, starts fresh |
| **API** | `load()`, `save()`, `currentChunk()`, `markChunkActive/Done/Failed()`, `setCoord()`, `updateMilestones()`, `recordDeath()`, `getSummary()` |
| **LLM integration** | `getSummary()` returns compact text for prompt injection |

### `docs/DRAGON_SLAYER_RC29.md` (this file)
Documentation, testing plan, and quick-start guide.

---

## Modified Files

### `src/agent/library/dragon_runner.js`
**Header/imports:** Added `import { DragonProgress, CHUNKS }` from `dragon_progress.js`. Added `getDimension()` helper.

**New functions:**
- `prepareForChunk(bot, chunkName, progress)` — adapts gear/food prep to target chunk
- `recoverFromDeath(bot, progress)` — goes to death location, picks up items, re-crafts lost tools

**Orchestrator rewrite** (`runDragonProgression`):
- Loads `DragonProgress` on entry, saves after each chunk transition
- Registers `bot.on('death')` handler to record death position + save state
- 5 retries per chunk (up from 3) with exponential backoff (1s → 2s → 4s → 8s → 16s, max 30s)
- `runner.check()` consults both inventory AND persistent state (e.g., milestones)
- `runner.onSuccess()` hooks save key coordinates (portal, fortress, stronghold, end portal positions)
- Death recovery between retries: respawn wait → go to death pos → pickup items → re-craft tools
- Explore to fresh area on retry (100 + 50*retryCount blocks)
- `finally` block always removes death listener

**Chunk functions:** Unchanged (proven gameplay logic preserved).

### `src/agent/commands/actions.js`
- Updated `!dragonProgression` timeout from 120min to 180min, description updated
- Added `!beatMinecraft` command (alias for `runDragonProgression`, 180min timeout)

---

## Updated Profiles

### `profiles/dragon-slayer.json`
- System prompt mentions `!beatMinecraft` and persistent progress
- Death recovery example updated: "Died! Progress is saved. !beatMinecraft"
- Self-prompt updated to lead with `!beatMinecraft`
- All conversation examples using `!dragonProgression` → `!beatMinecraft`

### `profiles/local-research.json`
- System prompt rule 19 updated to mention `!beatMinecraft` + persistent progress
- Added rule 22: "After dying, progress is saved — just re-run !beatMinecraft to resume."
- Conversation example for "defeat the ender dragon" → `!beatMinecraft`
- Self-prompt updated to lead with `!beatMinecraft`

---

## Testing Plan

### Unit-level Verification

| Test | How | Expected |
|------|-----|----------|
| **JSON parse** | `node -e "JSON.parse(require('fs').readFileSync('profiles/dragon-slayer.json'))"` | No error |
| **Import chain** | `node -e "import('./src/agent/library/dragon_runner.js').then(m => console.log(Object.keys(m)))"` | Exports: `buildNetherPortal`, `collectBlazeRods`, `collectEnderPearls`, `locateStronghold`, `defeatEnderDragon`, `runDragonProgression` |
| **Progress persistence** | Create DragonProgress, save, reload, verify state matches | State round-trips correctly |
| **Lint** | `npx eslint src/agent/library/dragon_progress.js src/agent/library/dragon_runner.js src/agent/commands/actions.js` | 0 errors, 0 warnings |
| **Command registration** | Start bot, check `!help` output includes `!beatMinecraft` | Listed with description |

### Integration Tests (Manual)

1. **Fresh start**: New world → `!beatMinecraft` → observe Chunk 1 (diamond pickaxe) begins
2. **Persistence**: Kill bot process mid-chunk → restart → `!beatMinecraft` → resumes from last incomplete chunk (not from scratch)
3. **Death recovery**: Let bot die during Chunk 3 (blaze rods) → observe death handler fires → on retry, bot goes to death pos, recovers items
4. **Exponential backoff**: Make chunk fail (e.g., block all iron spawns) → observe increasing backoff delays in logs
5. **Full run**: Fresh world → `!beatMinecraft` → dragon defeated (target: < 3 hours game time)
6. **Individual chunks**: `!getDiamondPickaxe` → `!buildNetherPortal` → etc. still work independently
7. **Interrupt**: Mid-run `!stop` → bot stops → `!beatMinecraft` → resumes from saved state

### Smoke Test Script

```bash
# 1. Validate all files
npx eslint src/agent/library/dragon_progress.js src/agent/library/dragon_runner.js src/agent/commands/actions.js

# 2. Validate profiles
node -e "JSON.parse(require('fs').readFileSync('profiles/dragon-slayer.json','utf8')); console.log('OK')"
node -e "JSON.parse(require('fs').readFileSync('profiles/local-research.json','utf8')); console.log('OK')"

# 3. Validate imports
node --input-type=module -e "import { runDragonProgression, buildNetherPortal, collectBlazeRods, collectEnderPearls, locateStronghold, defeatEnderDragon } from './src/agent/library/dragon_runner.js'; console.log('All exports OK')"

# 4. Run bot with dragon-slayer profile
node main.js --profiles ./profiles/dragon-slayer.json
```

---

## Quick-Start Guide

### Prerequisites
- Node.js v18+ (v20 LTS recommended)
- Minecraft server running — Paper 1.21.x server with `host` and `port` configured in `settings.js`
- Ollama running locally with `sweaterdog/andy-4:q8_0`, `nomic-embed-text`, and `llava` pulled: `ollama pull sweaterdog/andy-4:q8_0 && ollama pull nomic-embed-text && ollama pull llava`
- `npm install` completed

### Option A: DragonSlayer Bot (dedicated profile)
```bash
node main.js --profiles ./profiles/dragon-slayer.json
```
The bot will self-prompt and begin `!beatMinecraft` automatically.

### Option B: Any Bot, Manual Trigger
```bash
# Start your preferred bot
node main.js --profiles ./profiles/local-research.json

# In Minecraft chat:
DragonSlayer, !beatMinecraft
```

### Option C: Individual Chunks
```
!getDiamondPickaxe       # Chunk 1
!buildNetherPortal       # Chunk 2
!collectBlazeRods(12)    # Chunk 3
!collectEnderPearls(12)  # Chunk 4
!locateStronghold        # Chunk 5
!defeatEnderDragon       # Chunk 6
```

### Monitoring Progress
The persistent state is saved at `bots/<BotName>/dragon_progress.json`. You can inspect it:
```bash
cat bots/DragonSlayer/dragon_progress.json | python -m json.tool
```

### Resetting Progress
Delete the state file to start fresh:
```bash
rm bots/DragonSlayer/dragon_progress.json
```

### Troubleshooting
| Issue | Fix |
|-------|-----|
| Bot stuck in a loop | `!stop` then `!beatMinecraft` to resume from saved state |
| Bot keeps dying | Check food supply; modes `auto_eat` and `panic_defense` must be `true` |
| "Chunk X failed after 5 attempts" | Manual intervention needed: explore to better biome, ensure pickaxe/food, then `!beatMinecraft` |
| Bot won't enter Nether | Ensure `flint_and_steel` + obsidian portal exists; try `!buildNetherPortal` individually |
| State file corrupted | Delete `dragon_progress.json` and restart |
