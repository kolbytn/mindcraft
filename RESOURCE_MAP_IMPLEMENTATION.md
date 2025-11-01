# Resource Map Implementation Summary

**Date:** 2025-10-31
**Feature:** Shared resource discovery and querying system

---

## ✅ What Was Built

A shared knowledge base where bots log resource locations they discover, and Andy can query to find the nearest resources.

### Core Functionality

**Bots can:**
- Log resources: `!logResource("oak_log", x, y, z, "dense", "50+ trees")`
- Find nearest: `!findResource("oak_log")`
- View all: `!checkResourceMap()`
- Clean old: `!cleanResourceMap(7)`

**System tracks:**
- Resource type (oak_log, stone, iron_ore, etc.)
- Exact coordinates
- Abundance level (sparse, moderate, dense, abundant)
- Who discovered it
- When discovered
- Notes/description

---

## 📁 Files Created

### 1. `src/orchestration/resource_map.js` (NEW - 375 lines)

**ResourceMap class** with methods:
- `logResource()` - Add resource location
- `findNearest()` - Find closest resource by type
- `findAll()` - Get all locations of a type
- `getSummary()` - Get overview of all resources
- `cleanOldResources()` - Remove old entries
- `save()` / `load()` - Persistence

**Features:**
- Duplicate detection (within 10 blocks)
- Distance calculation (3D Euclidean)
- JSON + Markdown output
- Global singleton pattern

---

### 2. `src/agent/commands/mcp.js` (MODIFIED - +145 lines)

**Four new commands added:**

#### !logResource(type, x, y, z, abundance, notes)
```javascript
!logResource("oak_log", 120, 64, -45, "dense", "Forest with 50+ oak trees")
→ ✅ Logged oak_log at (120, 64, -45)
  Abundance: dense
  Notes: Forest with 50+ oak trees
```

#### !findResource(type, maxDistance)
```javascript
!findResource("oak_log")
→ 📍 Nearest oak_log:
  Location: (120, 64, -45)
  Distance: 85 blocks away
  Abundance: dense
  Discovered by: scout-1
  5 minutes ago
  Notes: Forest with 50+ oak trees
```

#### !checkResourceMap()
```javascript
!checkResourceMap()
→ 📋 Resource Map Summary:
  Total: 12 locations logged
  Types: 4 different resources

  📦 oak_log: 5 locations
  📦 stone: 3 locations
  📦 iron_ore: 3 locations
  📦 coal_ore: 1 location
```

#### !cleanResourceMap(days)
```javascript
!cleanResourceMap(7)
→ ✅ Cleaned resource map - removed 5 old resources (>7 days old)
```

---

### 3. `src/orchestration/prompts/scout_prompt.txt` (MODIFIED - +7 lines)

**Added instructions for scouts:**
```
3. **Resource Location Assessment & Logging**
   - LOG TO SHARED MAP: Use !logResource(type, x, y, z, abundance, notes)
   - Example: !logResource("oak_log", 120, 64, -45, "dense", "Forest with 50+ oak trees")
```

Scouts now automatically log resources during exploration!

---

### 4. Documentation Files (NEW)

- **RESOURCE_MAP_SYSTEM.md** (630 lines) - Complete feature guide
- **RESOURCE_MAP_IMPLEMENTATION.md** (This file) - Technical summary

---

## 🗂️ Data Files Created at Runtime

### `.mindcraft-agents/resource-map.json`
**Machine-readable data:**
```json
[
  {
    "type": "oak_log",
    "x": 120,
    "y": 64,
    "z": -45,
    "discoveredBy": "scout-1",
    "abundance": "dense",
    "notes": "Forest with 50+ oak trees",
    "timestamp": "2025-10-31T23:42:00.000Z"
  }
]
```

### `.mindcraft-agents/resource-map.md`
**Human-readable table:**
```markdown
# Minecraft Resource Map

## oak_log

| Coordinates | Abundance | Discovered By | When | Notes |
|-------------|-----------|---------------|------|-------|
| (120, 64, -45) | dense | scout-1 | 10/31/2025, 11:42 PM | Forest with 50+ oak trees |
```

---

## 🎯 Use Cases

### Use Case 1: Scout Discovery
```
scout-1 explores north
scout-1 finds oak forest at (120, 64, -45)
scout-1: !logResource("oak_log", 120, 64, -45, "dense", "50+ trees")
→ Logged to shared map ✅
```

### Use Case 2: Andy Queries
```
Andy needs wood
Andy: !findResource("oak_log")
→ Returns (120, 64, -45) - 85 blocks away
Andy spawns gatherer to exact location
→ No random searching needed! ✅
```

### Use Case 3: Multiple Scouts, One Map
```
scout-1 logs oak at (120, 64, -45) in north
scout-2 logs oak at (95, 65, -30) in east
scout-3 logs oak at (110, 63, 50) in south

Andy: !findResource("oak_log")
→ Returns NEAREST of the 3 locations ✅
```

### Use Case 4: Persistence
```
Day 1: scout-1 logs wood locations
Andy restarts overnight
Day 2: Andy: !findResource("oak_log")
→ Still has yesterday's data! ✅
```

---

## 🔧 Technical Implementation

### Distance Calculation
```javascript
distance = Math.sqrt(
    (resource.x - andy.x)² +
    (resource.y - andy.y)² +
    (resource.z - andy.z)²
)
```

### Duplicate Detection
```javascript
const duplicate = resources.find(r =>
    r.type === newResource.type &&
    Math.abs(r.x - newResource.x) < 10 &&
    Math.abs(r.z - newResource.z) < 10
);
```

Resources within 10 blocks are considered duplicates.

### Persistence
- Saved to `.mindcraft-agents/resource-map.json`
- Auto-saved after every log/clean operation
- Loaded on first use via lazy initialization

---

## 💡 Benefits

### Before:
```
Andy: "I need wood"
→ Spawns scout
→ Scout searches randomly (5 min)
→ Scout finds wood at (120, 64, -45)
→ Scout reports back
→ Spawns gatherer to (120, 64, -45)

Next day:
Andy: "I need wood again"
→ Spawns NEW scout
→ Scout searches SAME area again ❌
→ Wastes 5 more minutes ❌
```

### After:
```
Andy: "I need wood"
→ !findResource("oak_log")
→ Found at (120, 64, -45) (logged yesterday) ✅
→ Spawns gatherer immediately

Next day:
Andy: "I need wood again"
→ !findResource("oak_log")
→ Found at (120, 64, -45) ✅
→ Spawns gatherer immediately

No duplicate exploration! ✅
```

---

## 🚀 How to Use

### As a User (Natural Language)

```
/msg andy where's the nearest oak logs?
/msg andy find stone for me
/msg andy what resources do we know about?
/msg andy clean old resource entries
```

Andy will translate these to the appropriate commands.

### As Andy (Direct Commands)

```javascript
!findResource("oak_log")
!findResource("stone", 500)
!checkResourceMap()
!cleanResourceMap(7)
```

### As Scout (Auto-logging)

```javascript
// Scouts automatically log during exploration
!logResource("oak_log", 120, 64, -45, "dense", "50+ oak trees")
!logResource("stone", 95, 70, -10, "abundant", "Large stone hill")
```

---

## 📊 Example Workflow

```
User: "andy, explore the area and find resources"

Andy: !spawnBot("scout-1", "Scout", "Explore north")
Andy: !spawnBot("scout-2", "Scout", "Explore east")

scout-1: !logResource("oak_log", 120, 64, -45, "dense", "Forest")
scout-2: !logResource("oak_log", 95, 65, -30, "moderate", "Grove")
scout-1: !logResource("stone", 95, 70, -10, "abundant", "Hill")
scout-2: !logResource("iron_ore", 30, 12, 40, "moderate", "Cave")

User: "andy, I need wood"

Andy: !findResource("oak_log")
→ Nearest: (95, 65, -30) - 45 blocks away (closer than north forest!)

Andy: !spawnBot("gatherer-1", "Gatherer", "Collect 64 oak_log from (95, 65, -30)")

gatherer-1: Traveling to (95, 65, -30)...
gatherer-1: Arrived! Collecting wood...
gatherer-1: Collected 64 oak_log!
gatherer-1: Task complete!

Andy: !killBot("gatherer-1")
```

---

## 🔄 Integration with Orchestration

### Orchestrator Can Now:

1. **Check map before scouting:**
   ```javascript
   const known = resourceMap.findNearest("oak_log", x, y, z);
   if (known && known.distance < 200) {
       // Use known location
       spawnGatherer(known.x, known.y, known.z);
   } else {
       // Scout new area
       spawnScout();
   }
   ```

2. **Assign closest resources:**
   ```javascript
   const oakLocs = resourceMap.findAll("oak_log");
   const nearest = findNearest(oakLocs, andy.position);
   spawnGatherer(nearest.coords);
   ```

3. **Avoid duplicate scouting:**
   ```javascript
   if (resourceMap.hasType("stone")) {
       // Skip scouting, use known location
   }
   ```

---

## 🎉 Result

**Bots now have shared memory!**
- ✅ Scouts log discoveries
- ✅ Andy finds resources instantly
- ✅ No duplicate exploration
- ✅ Persistent across restarts
- ✅ Human-readable markdown output
- ✅ Machine-readable JSON data

**Efficiency gained:**
- 🚀 ~5 min saved per resource query (no re-scouting)
- 🚀 Smarter bot deployment (nearest resources)
- 🚀 Knowledge accumulates over time

---

## 📚 Documentation

**Complete guide:** [RESOURCE_MAP_SYSTEM.md](RESOURCE_MAP_SYSTEM.md)

**README updated:** Feature listed under "Key Features" and "Documentation"

---

## 🧪 Testing

**Restart Andy:**
```bash
# Stop (Ctrl+C)
npm start andy
```

**Test commands:**
```
/msg andy log a resource oak_log at 100 64 100 with abundance dense
/msg andy where's the nearest oak logs?
/msg andy check the resource map
/msg andy clean old resource entries
```

**Test with scouts:**
```
/msg andy spawn a scout to explore north
# Wait for scout to log resources
/msg andy where's the nearest oak logs?
# Should return what scout found!
```

---

## 🎯 Summary

**Lines Added:** ~520 lines total
- resource_map.js: 375 lines
- mcp.js: +145 lines

**Commands Added:** 4
- !logResource
- !findResource
- !checkResourceMap
- !cleanResourceMap

**Files Modified:** 3
- src/orchestration/resource_map.js (NEW)
- src/agent/commands/mcp.js (MODIFIED)
- src/orchestration/prompts/scout_prompt.txt (MODIFIED)

**Ready to use!** 🎉
