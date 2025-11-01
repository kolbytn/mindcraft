# Resource Map System

**Date:** 2025-10-31

## Overview

A shared knowledge base where all bots log resource locations they discover. Andy and other bots can query this map to find the nearest resources instead of randomly searching.

---

## How It Works

```
Scout bot finds oak forest
    ↓
!logResource("oak_log", 120, 64, -45, "dense", "50+ trees")
    ↓
Saved to .mindcraft-agents/resource-map.md
    ↓
Andy needs wood: "where's the closest oak logs?"
    ↓
!findResource("oak_log")
    ↓
Returns: (120, 64, -45) - 85 blocks away, dense, found by scout-1
```

---

## Files Created

### 1. `.mindcraft-agents/resource-map.md`
**Human-readable markdown** with all logged resources organized by type.

```markdown
# Minecraft Resource Map

**Last Updated:** 2025-10-31T23:45:00.000Z
**Total Resources Logged:** 12

---

## oak_log

| Coordinates | Abundance | Discovered By | When | Notes |
|-------------|-----------|---------------|------|-------|
| (120, 64, -45) | dense | scout-1 | 10/31/2025, 11:42 PM | Forest with 50+ oak trees |
| (95, 65, -30) | moderate | scout-2 | 10/31/2025, 11:40 PM | Small grove |

## stone

| Coordinates | Abundance | Discovered By | When | Notes |
|-------------|-----------|---------------|------|-------|
| (95, 70, -10) | abundant | scout-1 | 10/31/2025, 11:43 PM | Large stone hill |

```

### 2. `.mindcraft-agents/resource-map.json`
**Machine-readable JSON** for fast programmatic access.

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
  },
  ...
]
```

---

## Commands

### !logResource(type, x, y, z, abundance, notes)

**What it does:** Add a resource location to the shared map.

**Parameters:**
- `type` (string) - Resource type: oak_log, stone, iron_ore, coal_ore, etc.
- `x` (number) - X coordinate
- `y` (number) - Y coordinate
- `z` (number) - Z coordinate
- `abundance` (string, optional) - sparse, moderate, dense, abundant (default: unknown)
- `notes` (string, optional) - Additional description

**Examples:**
```javascript
!logResource("oak_log", 120, 64, -45, "dense", "Forest with 50+ oak trees")
!logResource("stone", 95, 70, -10, "abundant", "Large stone hill, easy mining")
!logResource("iron_ore", 30, 12, 40, "moderate", "Cave system with exposed iron")
!logResource("coal_ore", 35, 15, 45, "sparse", "Few veins near iron")
```

**Response:**
```
✅ Logged oak_log at (120, 64, -45)
Abundance: dense
Notes: Forest with 50+ oak trees
```

**Duplicate Detection:**
If resource already logged within 10 blocks:
```
ℹ️ oak_log at (120, 64, -45) already logged (within 10 blocks)
```

---

### !findResource(type, maxDistance)

**What it does:** Find nearest resource location from Andy's current position.

**Parameters:**
- `type` (string) - Resource type to find
- `maxDistance` (number, optional) - Maximum search distance in blocks (default: 1000)

**Examples:**
```javascript
!findResource("oak_log")
!findResource("stone")
!findResource("iron_ore", 500)
```

**Response (found):**
```
📍 Nearest oak_log:
Location: (120, 64, -45)
Distance: 85 blocks away
Abundance: dense
Discovered by: scout-1
5 minutes ago
Notes: Forest with 50+ oak trees
```

**Response (not found):**
```
❌ No oak_log locations logged yet.

Tip: Send scouts to explore and log resources!
```

**Response (too far):**
```
❌ No oak_log found within 500 blocks.

Closest known location is 750 blocks away (too far).
```

---

### !checkResourceMap()

**What it does:** View summary of all logged resources.

**Example:**
```javascript
!checkResourceMap()
```

**Response:**
```
📋 Resource Map Summary:

Total: 12 locations logged
Types: 4 different resources

📦 coal_ore: 2 locations
  └─ (35, 15, 45) (sparse) - found by scout-1
  └─ (40, 18, 50) (moderate) - found by scout-2

📦 iron_ore: 3 locations
  └─ (30, 12, 40) (moderate) - found by scout-1
  └─ (32, 10, 42) (dense) - found by scout-2
  └─ ...and 1 more

📦 oak_log: 5 locations
  └─ (120, 64, -45) (dense) - found by scout-1
  └─ (95, 65, -30) (moderate) - found by scout-2
  └─ ...and 3 more

📦 stone: 2 locations
  └─ (95, 70, -10) (abundant) - found by scout-1
  └─ (100, 72, -5) (dense) - found by scout-3

💡 Use !findResource("type") to get nearest location
```

**Empty map:**
```
📭 Resource map is empty.

No resources logged yet. Send scouts to explore!
```

---

### !cleanResourceMap(days)

**What it does:** Remove old resource locations (keeps map fresh).

**Parameters:**
- `days` (number, optional) - Remove entries older than this many days (default: 7)

**Examples:**
```javascript
!cleanResourceMap()        // Clean entries >7 days old
!cleanResourceMap(3)       // Clean entries >3 days old
!cleanResourceMap(14)      // Clean entries >14 days old
```

**Response:**
```
✅ Cleaned resource map - removed 5 old resources (>7 days old)
```

**If nothing to clean:**
```
✅ Resource map is clean - no entries older than 7 days.
```

---

## Workflow Examples

### Example 1: Andy Needs Wood

```
/msg andy where's the nearest oak logs?

Andy: !findResource("oak_log")
→ 📍 Nearest oak_log:
  Location: (120, 64, -45)
  Distance: 85 blocks away
  Abundance: dense
  Discovered by: scout-1
  5 minutes ago
  Notes: Forest with 50+ oak trees

Andy: Perfect! I'll send a gatherer there.
!spawnBot("gatherer-1", "Gatherer", "Collect 64 oak_log from (120, 64, -45)")
```

### Example 2: Scout Exploration

```
Andy: !spawnBot("scout-1", "Scout", "Explore north and log resources")

scout-1 exploring...
scout-1: Found oak forest! !logResource("oak_log", 120, 64, -45, "dense", "50+ trees")
→ ✅ Logged oak_log at (120, 64, -45)

scout-1: Found stone hill! !logResource("stone", 95, 70, -10, "abundant", "Large hill")
→ ✅ Logged stone at (95, 70, -10)

scout-1: Found iron cave! !logResource("iron_ore", 30, 12, 40, "moderate", "Exposed veins")
→ ✅ Logged iron_ore at (30, 12, 40)

scout-1: Scout complete! Logged 3 resource locations.
```

### Example 3: Multiple Scouts, One Map

```
Andy: !spawnBot("scout-1", "Scout", "Explore north")
Andy: !spawnBot("scout-2", "Scout", "Explore east")
Andy: !spawnBot("scout-3", "Scout", "Explore south")

// All scouts log to the SAME resource-map.md

scout-1: !logResource("oak_log", 120, 64, -45, "dense", "North forest")
scout-2: !logResource("oak_log", 95, 65, -30, "moderate", "East grove")
scout-3: !logResource("oak_log", 110, 63, 50, "abundant", "South jungle")

Andy: !checkResourceMap()
→ 📦 oak_log: 3 locations
  (All 3 scouts' discoveries shown)

Andy: !findResource("oak_log")
→ Returns NEAREST of the 3 locations based on Andy's position
```

### Example 4: Orchestration Integration

```
User: "andy, build a wooden house"

Andy: First, let me check if we know where wood is.
!findResource("oak_log")
→ 📍 Nearest oak_log: (120, 64, -45) - 85 blocks away

Andy: Great! I'll send a gatherer to the known location instead of searching randomly.
!spawnBot("gatherer-1", "Gatherer", "Collect 64 oak_log from (120, 64, -45)")
```

---

## Integration Points

### 1. Scout Bots (Automatic)

Scouts automatically log resources during exploration.

**Scout prompt includes:**
```
Example: !logResource("oak_log", 120, 64, -45, "dense", "Forest with 50+ oak trees")
Example: !logResource("stone", 95, 70, -10, "abundant", "Large stone hill, easy mining")
```

### 2. Andy's Decision Making

When Andy needs resources:
1. Check resource map first: `!findResource("oak_log")`
2. If found → spawn gatherer with exact coordinates
3. If not found → spawn scout to explore and log

### 3. Orchestrator

Bot orchestrator can use resource map to:
- Assign gatherers to closest known resources
- Avoid re-scouting already mapped areas
- Optimize bot deployment

---

## Technical Details

### Distance Calculation

```javascript
distance = Math.sqrt(
    (resource.x - andy.x)² +
    (resource.y - andy.y)² +
    (resource.z - andy.z)²
)
```

### Duplicate Detection

Resources within **10 blocks** of each other are considered duplicates:
```javascript
if (Math.abs(existing.x - new.x) < 10 &&
    Math.abs(existing.z - new.z) < 10)
    → Skip duplicate
```

### Abundance Levels

- **sparse** - Few resources (1-10 units)
- **moderate** - Some resources (10-30 units)
- **dense** - Many resources (30-100 units)
- **abundant** - Tons of resources (100+ units)
- **unknown** - Not assessed (default)

---

## Data Persistence

**Saved to disk:**
- JSON: `.mindcraft-agents/resource-map.json`
- Markdown: `.mindcraft-agents/resource-map.md`

**Persists across:**
- ✅ Bot restarts
- ✅ Andy restarts
- ✅ Server restarts
- ✅ Sessions

**Cleanup:**
- Manual: `!cleanResourceMap(days)`
- Recommended: Clean weekly to remove outdated entries

---

## Benefits

### Before Resource Map:
```
Andy: "I need wood"
Andy: !spawnBot("scout-1", "Scout", "Find wood anywhere")
scout-1: *explores randomly for 5 minutes*
scout-1: "Found wood at (120, 64, -45)"
Andy: !spawnBot("gatherer-1", "Gatherer", "Get wood from (120, 64, -45)")

Next day:
Andy: "I need more wood"
Andy: !spawnBot("scout-2", "Scout", "Find wood anywhere")
scout-2: *explores SAME area again* ❌
```

### After Resource Map:
```
Andy: "I need wood"
Andy: !findResource("oak_log")
→ Found at (120, 64, -45) - logged yesterday by scout-1 ✅
Andy: !spawnBot("gatherer-1", "Gatherer", "Get wood from (120, 64, -45)")

Next day:
Andy: "I need more wood"
Andy: !findResource("oak_log")
→ Still at (120, 64, -45) ✅
Andy: !spawnBot("gatherer-2", "Gatherer", "Get wood from (120, 64, -45)")

No duplicate scouting needed! ✅
```

---

## Usage Tips

**For Scouts:**
- Log every major resource cluster you find
- Use descriptive notes ("Dense forest", "Easy access", "Near water")
- Estimate abundance honestly

**For Andy:**
- Check map before spawning scouts
- Use `!findResource()` before `!spawnBot()`
- Clean old entries weekly

**For Orchestrator:**
- Prioritize known locations over exploration
- Only scout new areas if no known resources
- Share discoveries across all bots

---

## Files Modified

1. **src/orchestration/resource_map.js** (NEW)
   - ResourceMap class
   - Log/find/query methods
   - Persistence to JSON/Markdown

2. **src/agent/commands/mcp.js** (+145 lines)
   - !logResource command
   - !findResource command
   - !checkResourceMap command
   - !cleanResourceMap command

3. **src/orchestration/prompts/scout_prompt.txt** (+7 lines)
   - Instructions to log resources
   - Examples of !logResource usage

---

## Example Resource Map Output

**After a few scouts explore:**

```markdown
# Minecraft Resource Map

**Last Updated:** 2025-10-31T23:45:00.000Z
**Total Resources Logged:** 15

---

## coal_ore

| Coordinates | Abundance | Discovered By | When | Notes |
|-------------|-----------|---------------|------|-------|
| (35, 15, 45) | moderate | scout-2 | 10/31/2025, 11:44 PM | Near iron cave |
| (40, 18, 50) | sparse | scout-1 | 10/31/2025, 11:42 PM | Few veins |

## iron_ore

| Coordinates | Abundance | Discovered By | When | Notes |
|-------------|-----------|---------------|------|-------|
| (30, 12, 40) | dense | scout-1 | 10/31/2025, 11:43 PM | Cave with exposed veins |
| (32, 10, 42) | moderate | scout-3 | 10/31/2025, 11:45 PM | Extension of main cave |

## oak_log

| Coordinates | Abundance | Discovered By | When | Notes |
|-------------|-----------|---------------|------|-------|
| (120, 64, -45) | abundant | scout-1 | 10/31/2025, 11:42 PM | Massive forest, 100+ trees |
| (95, 65, -30) | dense | scout-2 | 10/31/2025, 11:40 PM | Oak grove with 50 trees |
| (110, 63, 50) | moderate | scout-3 | 10/31/2025, 11:44 PM | Small forest clearing |

## stone

| Coordinates | Abundance | Discovered By | When | Notes |
|-------------|-----------|---------------|------|-------|
| (95, 70, -10) | abundant | scout-1 | 10/31/2025, 11:43 PM | Large exposed stone hill |
| (100, 72, -5) | dense | scout-2 | 10/31/2025, 11:41 PM | Stone cliff face |

---

## How to Use

**Andy/Bots can query:**
- `!findResource("oak_log")` - Find nearest oak logs
- `!findResource("stone")` - Find nearest stone
- `!checkResourceMap()` - View all resources

**Bots log resources:**
- Scouts automatically log during exploration
- Gatherers log when they find new resource clusters
- Use: `!logResource("oak_log", x, y, z, "Dense forest, 50+ trees")`
```

---

## Ready to Use!

Restart Andy to load the new commands, then:

```bash
# Test logging
/msg andy log a resource at 100 50 100 of type oak_log with abundance dense

# Test finding
/msg andy where's the nearest oak logs?

# Test summary
/msg andy check the resource map
```

All bots will now share resource knowledge! 🗺️
