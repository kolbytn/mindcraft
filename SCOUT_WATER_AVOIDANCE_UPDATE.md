# Scout Water Avoidance Update

**Date:** 2025-10-31
**Issue:** Scouts keep drowning or getting stuck in infinite water escape loops
**Solution:** Massively strengthened water avoidance in scout prompt

---

## What Changed

Updated `src/orchestration/prompts/scout_prompt.txt` with **extreme water avoidance warnings**.

### Before:
```
⚠️ CRITICAL RULE: AVOID WATER! Stay on land whenever possible.
```

### After:
```
🚨🚨🚨 CRITICAL SURVIVAL RULE #1: NEVER GO NEAR WATER! 🚨🚨🚨

**WATER = DEATH. WATER = FAILURE. AVOID AT ALL COSTS.**

You WILL drown if you enter water. You WILL get stuck. You WILL fail the mission.
```

---

## Key Additions

### 1. Prominent Top Warning (Lines 6-60)
- **WATER = DEATH** messaging at the very top
- Cannot be missed - first thing scout sees
- Clear consequences: drowning, failure, mission abort

### 2. Detailed Water Avoidance Protocol
```
**BEFORE EVERY MOVEMENT:**
1. Use !nearbyBlocks FIRST - ALWAYS CHECK BEFORE MOVING
2. Read the output carefully - look for "water" keyword
3. If you see "water" anywhere in output → STOP IMMEDIATELY
4. If you see "water" → Choose OPPOSITE direction on DRY LAND
5. If you see "water" → Add 50 blocks distance in a different direction
6. NEVER use !goToCoordinates toward water - it will kill you
```

### 3. Safe vs Dangerous Biomes List
**SAFE (DRY LAND):**
- ✅ Plains, Forests, Hills, Mountains, Deserts, Savannas

**DANGEROUS (WATER DEATH TRAPS):**
- ❌ Rivers, Oceans, Lakes, Swamps, Beaches

### 4. Movement Checklist (Lines 154-159)
Repeated checklist for EVERY movement:
1. ✅ Use !nearbyBlocks FIRST
2. ✅ Read output - scan for "water" keyword
3. ✅ If "water" found → ABORT, choose different direction
4. ✅ If no "water" found → SAFE to use !goToCoordinates
5. ✅ After moving → repeat checklist

### 5. Updated Example Tasks
Added water checks to every example:
```
Scout Actions:
- ⚠️ CHECK !nearbyBlocks FIRST - ensure you're on dry land
- ⚠️ If you see "water" → move 50+ blocks away to safe dry zone
- ⚠️ Before EACH movement: !nearbyBlocks → check for "water" → abort if found
```

### 6. Final Warning (Lines 175-179)
```
🚨 FINAL WARNING: WATER = INSTANT MISSION FAILURE 🚨
If you go in water, you WILL drown. The mission WILL fail.
Scout on DRY LAND ONLY. Check !nearbyBlocks BEFORE EVERY MOVE.
Your survival depends on staying away from water. DO NOT TEST THIS.
```

---

## Specific Instructions Added

### Emergency Water Protocol
```
**IF YOU SOMEHOW END UP IN WATER (Emergency):**
1. IMMEDIATELY say "EMERGENCY! IN WATER!"
2. IMMEDIATELY use !escapeWater command
3. DO NOT try to swim or explore - GET OUT NOW
4. After escape, move at least 50 blocks away from water
5. Continue scouting ONLY on confirmed dry land
```

### What NOT To Do
```
**IF YOU SEE WATER IN !nearbyBlocks OUTPUT:**
- ❌ DO NOT continue in that direction
- ❌ DO NOT try to "go around" it (you'll fall in)
- ❌ DO NOT get close to investigate
- ✅ TURN AROUND and pick completely different coordinates
- ✅ Move AWAY from water, at least 50 blocks
- ✅ Scout in plains, forests, hills instead
```

---

## Prompt Statistics

**Water warnings now appear:**
- **Line 6-14:** Top-level critical warning (8 lines)
- **Line 21-60:** Water avoidance protocol (39 lines)
- **Line 75-83:** Movement instructions (9 lines)
- **Line 135-142:** Example task (8 lines)
- **Line 154-179:** Movement checklist + final warning (26 lines)

**Total:** ~90 lines of water-related warnings out of 180 total lines (50% of prompt!)

**Water keyword mentioned:** 45+ times throughout prompt

---

## Testing After Update

**Restart Andy to load updated prompt:**
```bash
npm start andy
```

**Test spawn:**
```
/msg andy spawn scout-1 to explore north and log resources
```

**Expected behavior:**
1. Scout checks !nearbyBlocks before every move
2. If "water" detected → turns around, moves opposite direction
3. Only scouts on dry land (plains, forests, hills)
4. Logs resources found on dry land only
5. Never drowns or gets stuck in water loops

**What scout should NOT do:**
- ❌ Move toward rivers, oceans, lakes
- ❌ Enter water for any reason
- ❌ Try to "investigate" water sources
- ❌ Skip !nearbyBlocks checks
- ❌ Continue in a direction where water was detected

---

## Why This Should Work

### Problem Before:
- Scout prompt mentioned water avoidance casually
- LLM would pathfind toward water despite warnings
- Water escape mode would trigger infinite loops
- Scouts would drown or get kicked for spam

### Solution Now:
- Water avoidance is THE #1 PRIORITY (50% of prompt)
- Multiple redundant warnings at every step
- Clear consequences: "DEATH", "FAILURE"
- Explicit checklist: !nearbyBlocks → check "water" → abort
- Safe biomes listed, dangerous biomes banned
- Emergency protocol if water entry happens

### Psychology:
- **Repetition:** Water warnings repeated 45+ times
- **Emphasis:** ALL CAPS, emojis, bold text
- **Consequences:** Clear death/failure messaging
- **Checklist:** Step-by-step protocol to follow
- **Examples:** Shows exactly what to do in each scenario

---

## Fallback Safety

If scout STILL enters water despite all warnings, the emergency protocol kicks in:

```
1. IMMEDIATELY say "EMERGENCY! IN WATER!"
2. IMMEDIATELY use !escapeWater command
3. DO NOT try to swim - GET OUT NOW
4. Move at least 50 blocks away from water
5. Continue scouting ONLY on confirmed dry land
```

This prevents the infinite loop by:
- Moving 50+ blocks away after escape
- Explicit instruction to NOT return to water
- Clear directive to scout on confirmed dry land only

---

## Files Modified

**File:** `src/orchestration/prompts/scout_prompt.txt`
**Lines changed:** ~90 lines (50% of prompt rewritten)
**Focus:** Water avoidance as #1 priority

---

## Result

**Scouts should now:**
- ✅ Survive exploration missions
- ✅ Stay on dry land at all times
- ✅ Check !nearbyBlocks before EVERY move
- ✅ Abort movement if water detected
- ✅ Scout plains, forests, hills (safe biomes)
- ✅ Log resources from dry land only
- ✅ Complete missions without drowning

**No more:**
- ❌ Drowning deaths
- ❌ Infinite water escape loops
- ❌ Spam kicks from "I'm in water!" messages
- ❌ Mission failures due to water hazards

---

## Next Steps

1. **Restart Andy** to load updated scout prompt
2. **Test with careful spawn:**
   ```
   /msg andy spawn scout-1 to explore and log resources on dry land
   ```
3. **Monitor scout behavior** - should check !nearbyBlocks frequently
4. **Verify no water deaths** - scout should stay on plains/forests/hills

---

## Additional Safeguards

If scouts STILL have issues, we can:

1. **Disable self_preservation for scouts** (prevents water escape spam)
2. **Spawn scouts at known-safe coordinates** (away from rivers)
3. **Add pathfinding water penalty** (make pathfinder avoid water blocks)
4. **Limit scout movement radius** (stay within safe zone)

But with 50% of the prompt dedicated to water avoidance, this should be sufficient.

---

## Summary

**What we did:**
Massively emphasized water avoidance in scout prompt - now 50% of prompt content.

**How we did it:**
- Top-level warnings (lines 6-14)
- Detailed protocols (lines 21-60)
- Movement checklist (lines 154-159)
- Updated examples (lines 135-142)
- Final warning (lines 175-179)
- 45+ mentions of water hazards

**Why this should work:**
LLM cannot possibly miss water warnings when they dominate the prompt and appear at every step.

**Test now:**
Restart Andy, spawn scout, verify it stays on dry land! 🏜️✨
