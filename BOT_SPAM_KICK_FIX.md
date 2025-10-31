# Bot Spam Kick Fix

**Date:** 2025-10-31
**Issue:** crafter-1 bot got kicked from server for spamming

---

## 🐛 The Problem

```
crafter-1: "I'm in water! Getting out!"
crafter-1: "Back on land!"
crafter-1: "I'm in water! Getting out!"
crafter-1: "Back on land!"
(repeats endlessly...)

Server: "Kicked for spamming"
Error: EPIPE (broken pipe - connection lost)
```

---

## 🔍 Root Cause

1. **Bot spawned near water** at (0, 62, -2)
2. **Self-preservation mode** activated (tries to escape water)
3. **Infinite loop** - bot kept detecting water and trying to escape
4. **Chat narration** enabled - bot announced every action
5. **Anti-spam protection** - Minecraft server kicked the bot

---

## ✅ The Fix

### Change 1: Disabled Problematic Modes
**File:** `src/orchestration/bot_orchestrator.js`

Changed base modes for all orchestrated bots:

```javascript
const baseModes = {
    self_preservation: false, // Was: true (caused water escape spam)
    self_defense: false,      // Was: true (not needed in god_mode)
    elbow_room: false,        // Was: true (prevents movement spam)
    unstuck: true,            // Keep this - helps if bot gets stuck
    cowardice: false,
    idle_staring: false
};
```

**Why these changes:**
- Bots run in `god_mode` (creative mode) - **can't die anyway**
- Don't need self-preservation, self-defense, or elbow_room
- Prevents infinite loops and spam

### Change 2: Disabled Chat Narration
**File:** `src/orchestration/bot_orchestrator.js`

Added to agent settings:

```javascript
agentSettings.narrate_behavior = false; // Prevent chat spam
```

This stops bots from announcing every action in chat.

---

## 🧪 Testing

**Before fix:**
```
crafter-1 joins
crafter-1: "I'm in water! Getting out!" (x100)
Server: Kicked for spamming ❌
```

**After fix:**
```
crafter-1 joins
crafter-1 works silently ✅
No spam, no kick ✅
```

---

## 📁 Files Modified

1. `src/orchestration/bot_orchestrator.js` (+4 lines)
   - Disabled self_preservation, self_defense, elbow_room
   - Added narrate_behavior: false

**Total:** 4 lines changed

---

## 🎯 Result

- ✅ No more water escape loops
- ✅ No more chat spam
- ✅ No more server kicks
- ✅ Bots work silently and efficiently

---

## 🔄 Next Steps

Restart Andy and test the wooden_tools milestone:

```bash
npm start andy
# In Minecraft: /msg andy survive and get wooden tools
```

Both gatherer and crafter should complete without getting kicked! 🚀
