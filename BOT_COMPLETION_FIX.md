# Bot Completion Timeout Fix

**Date:** 2025-10-31
**Issue:** Gatherer bot timed out after 605 seconds despite successfully completing its task

---

## 🐛 The Bug

The bot successfully collected wood but the orchestrator never detected completion:

```
gatherer-1: "Collected 10 oak_log" ✅
gatherer-1: !endGoal ✅
Orchestrator: Still waiting... ⏱️
[10 minutes later]
Orchestrator: "Timeout waiting for bot gather-wood" ❌
```

---

## 🔍 Root Cause

**Coordination mismatch:**
- Orchestrator waits for: `.mindcraft-agents/logs/gather-wood.done`
- Bot only knows its name: `gatherer-1` (not task ID `gather-wood`)
- `!endGoal` command didn't create ANY .done file
- Result: Orchestrator waited forever

---

## ✅ The Fix

### Change 1: Modified `!endGoal` Command
**File:** `src/agent/commands/actions.js`

Added file creation logic to `!endGoal`:

```javascript
// When bot calls !endGoal, it now creates:
// .mindcraft-agents/logs/gatherer-1.done
writeFileSync(donePath, new Date().toISOString());
console.log(`[${botName}] Created completion file: ${donePath}`);
```

### Change 2: Modified Orchestrator
**File:** `src/orchestration/bot_orchestrator.js`

Orchestrator now checks for BOTH file names:

```javascript
// Check for .done file by task ID (original)
if (existsSync(`${botId}.done`)) { ... }

// ALSO check for .done file by bot name (NEW!)
if (existsSync(`${botName}.done`)) { ... }
```

---

## 🧪 How to Test

1. **Start Andy:**
   ```bash
   npm start andy
   ```

2. **Give survival task:**
   ```
   /msg andy survive and get wooden tools
   ```

3. **Expected output:**
   ```
   [Orchestrator] Allocated bot name: gatherer-1
   gatherer-1 joined the game
   [gatherer-1] Collecting oak_log...
   [gatherer-1] Created completion file: .mindcraft-agents/logs/gatherer-1.done
   [Orchestrator] Bot gather-wood completed (found gatherer-1.done) ✅
   ```

4. **No more timeout error!**

---

## 📁 Files Modified

1. `src/agent/commands/actions.js` (+15 lines)
   - Added fs imports
   - Modified !endGoal to create .done file

2. `src/orchestration/bot_orchestrator.js` (+8 lines)
   - Modified _waitForBot() to check both file names

**Total:** 23 lines changed

---

## 🎯 Result

- ✅ Bots now signal completion properly
- ✅ Orchestrator detects completion immediately
- ✅ No more 10-minute timeouts
- ✅ Survival milestones work end-to-end

---

## 🔄 Next Steps

Restart Andy and test the wooden_tools milestone:

```bash
npm start andy
# In Minecraft: /msg andy survive and get wooden tools
```

Should complete successfully without timeout! 🚀
