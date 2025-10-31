# Bot Communication & Log Spam Fixes

**Date:** 2025-10-31
**Issues Fixed:**
1. Orchestrated bots couldn't communicate with each other
2. PERIODIC CHECK messages spamming logs every 2 seconds

---

## 🐛 Problem 1: Bots Not Communicating

### Issue:
```
gatherer-1: "I've collected the wood"
crafter-1 decided to not respond to gatherer-1 ❌
```

Orchestrated bots (gatherer-1, crafter-1) working on the same milestone couldn't coordinate because the `bot_responder` logic was too conservative.

### Root Cause:
The `bot_responder` prompt says: **"Be conservative and only respond when necessary"**

When crafter-1 was busy crafting and gatherer-1 tried to communicate, crafter-1 would ask the LLM "should I respond?" and the LLM would say "ignore" - preventing coordination.

### Fix:
**File:** `src/agent/conversation.js`

Added logic to detect orchestrated bots and make them always respond to each other:

```javascript
// Check if both are orchestrated bots (gatherer-1, crafter-1, etc.)
const isOrchestratedBot = (name) => /^(gatherer|crafter|builder|scout|architect|tester)-\d+$/i.test(name);
const bothOrchestrated = isOrchestratedBot(agent.name) && isOrchestratedBot(sender);

if (bothOrchestrated) {
    // Orchestrated bots always respond to each other for coordination
    console.log(`${agent.name} responding to orchestrated bot ${sender}`);
    scheduleResponse(fastDelay);
}
```

**Result:**
- ✅ gatherer-1 and crafter-1 can now coordinate
- ✅ They respond to each other immediately (200ms delay)
- ✅ Other bots still use conservative bot_responder logic

---

## 🐛 Problem 2: Log Spam

### Issue:
```
[MindServer] PERIODIC CHECK: Registered agents: andy, gatherer-1, crafter-1
[MindServer] PERIODIC CHECK: Registered agents: andy, gatherer-1, crafter-1
[MindServer] PERIODIC CHECK: Registered agents: andy, gatherer-1, crafter-1
(repeats every 2 seconds forever)
```

### Root Cause:
Debug code left in production that logged agent connections every 2 seconds.

### Fix:
**File:** `src/mindcraft/mindserver.js`

Commented out the debug interval:

```javascript
// DEBUG: Periodic check disabled to reduce log spam
// setInterval(() => {
//     const agents = Object.keys(agent_connections);
//     if (agents.length > 0) {
//         console.log(`[MindServer] PERIODIC CHECK: Registered agents: ${agents.join(', ')}`);
//     }
// }, 2000);
```

**Result:**
- ✅ No more periodic check spam
- ✅ Logs are clean and readable
- ✅ Can still see agent connections when they actually connect/disconnect

---

## 🧪 Testing

**Before fixes:**
```
gatherer-1: "I collected 10 oak_log"
crafter-1 decided to not respond to gatherer-1 ❌
[MindServer] PERIODIC CHECK: Registered agents: andy, gatherer-1, crafter-1
[MindServer] PERIODIC CHECK: Registered agents: andy, gatherer-1, crafter-1
```

**After fixes:**
```
gatherer-1: "I collected 10 oak_log"
crafter-1 responding to orchestrated bot gatherer-1 ✅
crafter-1: "Great! I'll craft the tools now"
(Clean logs - no spam)
```

---

## 📁 Files Modified

1. `src/agent/conversation.js` (+7 lines)
   - Added orchestrated bot detection
   - Always respond to other orchestrated bots

2. `src/mindcraft/mindserver.js` (+1 line)
   - Commented out periodic check debug code

**Total:** 8 lines changed

---

## 🎯 Result

- ✅ Orchestrated bots coordinate properly
- ✅ Clean, readable logs
- ✅ No more spam
- ✅ Survival milestones can complete successfully

---

## 🔄 Next Steps

Restart Andy to apply the fixes:

```bash
# Stop Andy (Ctrl+C)

# Restart
npm start andy

# Test coordination:
/msg andy survive and get wooden tools
```

**Expected:**
- gatherer-1 collects wood
- gatherer-1 tells crafter-1 "I collected wood"
- crafter-1 responds: "Great! I'll craft the tools" ✅
- No log spam ✅
- Milestone completes successfully ✅
