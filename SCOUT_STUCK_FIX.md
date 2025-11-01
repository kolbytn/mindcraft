# Scout Bot Stuck Issues - Quick Fix Guide

**Date:** 2025-10-31

## Problems Identified

1. ✅ **Whitelist issue** - scout-2 not whitelisted (FIXED in whitelist.json)
2. ⏳ **Spawn timeout** - 30s too short (FIXED - increased to 120s)
3. ⚠️ **Water loop** - Scout drowns or gets stuck in water escape loop

---

## Issue 1: Whitelist Not Reloaded ✅ FIXED

**Problem:**
```
Disconnecting scout-2: You are not whitelisted on this server!
```

**Fix Applied:**
All 90 bot names added to `/opt/minecraft/paper/whitelist.json`

**Action Required:**
Run in Minecraft server console:
```
whitelist reload
```

**Verify:**
```bash
cat /opt/minecraft/paper/whitelist.json | jq -r '.[].name' | grep scout
# Should show scout-1 through scout-10
```

---

## Issue 2: Spawn Timeout ✅ FIXED

**Problem:**
```
Bot has not spawned after 30 seconds. Exiting.
```

**Fix Applied:**
Changed `settings.js` line 56:
```javascript
"spawn_timeout": 120,  // Was 30, now 120 seconds
```

**Action Required:**
Restart Andy to apply:
```bash
# Stop Andy (Ctrl+C)
npm start andy
```

---

## Issue 3: Scout Water Death Loop ⚠️ ACTIVE ISSUE

**Problem:**
Scout bot gets in water, tries to escape, but keeps triggering water detection infinitely:

```
scout-1: "I'm in water! Getting out!"
scout-1: "Back on land!"
scout-1: "I'm in water! Getting out!"
scout-1: "Back on land!"
(repeats until drowned or kicked for spam)
```

**Root Cause:**
The `self_preservation` mode (lines 40-70 in `src/agent/modes.js`) keeps detecting water even after escaping, creating an infinite loop.

**Why This Happens:**
1. Scout pathfinding moves toward water
2. `self_preservation` detects water → "I'm in water!"
3. Escapes to land → "Back on land!"
4. Self-prompter continues task → pathfinding moves back toward water
5. Loop repeats → drowning or spam kick

---

## Temporary Workarounds

### Option 1: Disable Scout Self-Preservation (Quick)

Edit the scout spawn to disable self_preservation mode:

**File:** `src/orchestration/bot_orchestrator.js`

Find line ~318 (baseModes for scout):
```javascript
const baseModes = {
    self_preservation: false,  // Disable for scouts - they keep dying in water
    unstuck: true,
    cowardice: false,
    self_defense: false,
    elbow_room: false,
    idle_staring: false
};
```

**Trade-off:** Scout won't auto-escape dangers, but won't spam either.

---

### Option 2: Reduce Narration (Already Applied)

We already set `narrate_behavior: false` in bot_orchestrator.js line 467.

This prevents "I'm in water!" spam messages, but the loop still happens silently.

---

### Option 3: Spawn Location Fix (Recommended)

**Problem:** Scouts spawn near water/rivers

**Solution:** Spawn scouts away from spawn point or give explicit safe coordinates:

```javascript
!spawnBot("scout-1", "Scout", "Explore NORTH (avoid water!) from (10, 70, -100) for 200 blocks")
```

Specify a known-safe starting point on land.

---

### Option 4: Increase Water Cooldown (Code Fix)

**File:** `src/agent/modes.js` (lines 35-70)

Add cooldown to prevent repeated water detection:

```javascript
self_preservation: {
    name: 'self_preservation',
    lastWaterEscape: 0,  // Track last escape time
    description: 'Run away from danger...',
    interrupts: ['followPlayer', 'chasePlayer'],
    onTick: (agent) => {
        const bot = agent.bot;
        // ... existing code ...

        if (block.name === 'water' || blockAbove.name === 'water') {
            // Add cooldown check
            const now = Date.now();
            if (now - this.lastWaterEscape < 5000) {
                // Skip if escaped <5 seconds ago
                return;
            }

            say(agent, 'I\'m in water! Getting out!');
            this.lastWaterEscape = now;  // Mark escape time

            // ... rest of water escape code ...
        }
    }
}
```

This prevents spam by adding 5-second cooldown between water escapes.

---

## Permanent Solution: Better Water Avoidance

**The real fix:** Prevent scouts from pathfinding into water in the first place.

**Implementation needed:**

1. **Before movement, check for water:**
   ```javascript
   // In scout prompt/code
   !nearbyBlocks  // Check ahead BEFORE moving
   if (output.includes("water")) {
       // Choose different direction
   }
   ```

2. **Pathfinding water penalty:**
   Make mineflayer pathfinder heavily penalize water blocks:
   ```javascript
   bot.pathfinder.setGoal(goal, {
       penalties: {
           water: 100  // Heavily avoid water
       }
   });
   ```

3. **Scout spawn location:**
   Spawn scouts on known-dry land, not near rivers.

---

## Testing After Fixes

**Test 1: Whitelist**
```bash
# In Minecraft console
whitelist reload

# In game chat
/msg andy spawn scout-1 to explore north
# scout-1 should join successfully
```

**Test 2: Spawn Timeout**
```bash
# Restart Andy first!
npm start andy

# Then test
/msg andy spawn three scouts to explore in all directions
# All 3 should join within 120 seconds
```

**Test 3: Water Avoidance**
```bash
# Spawn scout on land away from water
/msg andy spawn scout-1 at coordinates 50 70 50 to explore north

# Or spawn in known-dry biome
/msg andy spawn scout-1 in plains biome to explore
```

---

## Immediate Actions

**Right now:**

1. **Reload whitelist in Minecraft console:**
   ```
   whitelist reload
   ```

2. **Restart Andy:**
   ```bash
   # Stop Andy (Ctrl+C)
   npm start andy
   ```

3. **Test with careful spawn:**
   ```
   /msg andy spawn scout-1 to explore NORTH on dry land avoiding water
   ```

---

## Why Scouts Keep Drowning

**The spawn point is near a river:**
```
scout-1 spawned at: (-3.5, 60, -11.5)
Biome: river
```

The bot literally spawns IN or NEXT TO water, triggering self_preservation immediately.

**Solutions:**
- Spawn scouts at known-dry coordinates
- Disable self_preservation for scouts
- Add water cooldown to prevent loops
- Make pathfinding avoid water

---

## Quick Command Reference

**Reload whitelist:**
```bash
./reload_whitelist.sh
# Then in Minecraft console: whitelist reload
```

**Check whitelist:**
```bash
cat /opt/minecraft/paper/whitelist.json | jq -r '.[].name' | grep scout
```

**Check bot logs:**
```bash
tail -f /opt/minecraft/paper/logs/latest.log | grep scout
```

**Restart Andy:**
```bash
# Ctrl+C to stop
npm start andy
```

---

## Summary

**Fixed:**
- ✅ Whitelist has all 90 bots (need to reload in server)
- ✅ Spawn timeout increased to 120s (need to restart Andy)

**Still needs work:**
- ⚠️ Scout water avoidance (use workarounds above)
- ⚠️ Spawn location (avoid rivers)

**Best workaround for now:**
Spawn scouts with explicit safe coordinates away from water.
