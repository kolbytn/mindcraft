# Minecraft Bot Orchestration System

## Overview

This system enables andy (and other bots) to spawn multiple coordinated Minecraft bots that work together on complex tasks. Inspired by context-foundry's multi-agent orchestration pattern, adapted for Minecraft gameplay.

## Pattern: Scout → Architect → Builder → Tester

```
User: "andy, build a house"
  ↓
Andy: !orchestrateTask("Build house", "Create a 10x10 wooden house with door and windows")
  ↓
[PHASE 1: Scout Bot spawns]
  - Gathers resources info
  - Assesses location
  - Writes scout-report.md
  - Signals complete (.done file)
  ↓
[PHASE 2: Architect Bot spawns]
  - Reads scout-report.md
  - Creates detailed plan
  - Writes architecture.md
  - Optionally creates build-tasks.json
  - Signals complete
  ↓
[PHASE 3: Builder Bot(s) spawn]
  - Reads architecture.md
  - Executes the build
  - Can run in PARALLEL if multiple tasks
  - Coordinates via files + chat
  - Signals complete when done
  ↓
[PHASE 4: Tester Bot spawns]
  - Reads architecture.md
  - Inspects the build
  - Tests functionality
  - Writes test-report.md
  - Signals PASS or FAIL
  ↓
Andy: "House complete! 4 bots used, all phases passed."
```

## New MCP Commands

### `!orchestrateTask(taskName, taskDescription, parallel)`

Orchestrates a complete task using the full Scout→Architect→Builder→Tester workflow.

**Parameters:**
- `taskName` (string): Name of the task (e.g., "Build house")
- `taskDescription` (string): Detailed description
- `parallel` (boolean, optional): Allow parallel execution. Default: true

**Example:**
```
!orchestrateTask("Build house", "Create a 10x10 wooden house with oak planks, glass windows, and oak door")
```

**Returns:**
```
✅ Task "Build house" complete!

Duration: 247 seconds
Phases: 4
Bots spawned: 4

Phase breakdown:
- Scout (scout-1): 45s
- Architect (architect-1): 62s
- Builder (builder-1): 120s
- Tester (tester-1): 20s

Results saved to: .mindcraft-agents/context/orchestration-results.json
```

### `!spawnBot(botName, role, task)`

Spawn a single bot with a specific role.

**Parameters:**
- `botName` (string): Name for the bot (e.g., "miner-1")
- `role` (string): Role (Scout, Architect, Builder, Tester, or custom)
- `task` (string): What the bot should do

**Example:**
```
!spawnBot("miner-1", "Builder", "Mine 64 cobblestone from nearby mountain")
```

**Returns:**
```
✅ Bot "miner-1" spawned as Builder!
Task: Mine 64 cobblestone from nearby mountain
The bot should appear in-game shortly.
```

### `!botStatus(botId)`

Check status of spawned bots.

**Parameters:**
- `botId` (string, optional): Specific bot to check. Omit to list all.

**Example:**
```
!botStatus()
```

**Returns:**
```
Active bots: 2

✅ Complete scout-1 (Scout): 127s
  Task: Scout for resources needed for building a house...

⏳ Working architect-1 (Architect): 45s
  Task: Read scout-report.md and create a detailed plan for building...
```

### `!listBots()`

List all active bots.

**Example:**
```
!listBots()
```

**Returns:**
```
Active Minecraft bots: 3

✅ scout-1 (Scout) - 180s
⏳ architect-1 (Architect) - 45s
⏳ builder-1 (Builder) - 12s

Use !botStatus("bot-id") for details.
```

## How It Works

### 1. Orchestration Flow

```
BotOrchestrator
  │
  ├─> Phase 1: Spawn Scout
  │     ├─> Scout explores and gathers info
  │     ├─> Writes .mindcraft-agents/context/scout-report.md
  │     └─> Creates .mindcraft-agents/logs/scout-1.done
  │
  ├─> Orchestrator detects scout-1.done
  │
  ├─> Phase 2: Spawn Architect
  │     ├─> Architect reads scout-report.md
  │     ├─> Writes .mindcraft-agents/context/architecture.md
  │     ├─> Optionally writes build-tasks.json
  │     └─> Creates architect-1.done
  │
  ├─> Orchestrator detects architect-1.done
  │
  ├─> Phase 3: Spawn Builder(s)
  │     ├─> If parallel: spawns multiple builders
  │     ├─> Each reads architecture.md
  │     ├─> Executes assigned tasks
  │     └─> Creates builder-N.done when complete
  │
  ├─> Orchestrator waits for all builders
  │
  ├─> Phase 4: Spawn Tester
  │     ├─> Tester reads architecture.md
  │     ├─> Inspects the build
  │     ├─> Writes test-report.md
  │     └─> Creates tester-1.done
  │
  └─> Task complete!
```

### 2. File-Based Coordination

All bots communicate via files in `.mindcraft-agents/`:

```
.mindcraft-agents/
├── profiles/              # Dynamic bot profiles
│   ├── scout-1.json
│   ├── architect-1.json
│   ├── builder-1.json
│   └── tester-1.json
│
├── context/               # Shared context files
│   ├── scout-report.md        # Scout → Architect
│   ├── architecture.md        # Architect → Builders
│   ├── build-tasks.json       # Architect → Orchestrator (parallel tasks)
│   ├── test-report.md         # Tester → User
│   └── orchestration-results.json  # Final results
│
├── logs/                  # Bot activity logs
│   ├── scout-1.log
│   ├── scout-1.done       # Completion marker
│   ├── architect-1.log
│   ├── architect-1.done
│   ├── builder-1.log
│   ├── builder-1.done
│   ├── tester-1.log
│   └── tester-1.done
│
└── chat-history.json      # In-game chat coordination
```

### 3. Hybrid Coordination

Bots use **both** file-based and chat-based coordination:

**File-Based:**
- Scout writes findings to `scout-report.md`
- Architect reads it and writes `architecture.md`
- Builders read architecture and execute
- Tester reads architecture and verifies
- All signal completion with `.done` files

**Chat-Based:**
- Bots can send status updates: `[STATUS] Foundation 50% complete`
- Directed messages: `@builder-2: Wait for me to finish foundation`
- Broadcast: `@all: Foundation complete, starting walls`

### 4. Parallel Execution

If the Architect determines tasks can run in parallel:

```json
// .mindcraft-agents/context/build-tasks.json
{
  "parallel_mode": true,
  "tasks": [
    {
      "id": "task-1",
      "description": "Gather 200 oak logs",
      "dependencies": []
    },
    {
      "id": "task-2",
      "description": "Gather 100 cobblestone",
      "dependencies": []
    },
    {
      "id": "task-3",
      "description": "Build foundation",
      "dependencies": ["task-1", "task-2"]
    }
  ]
}
```

Orchestrator executes:
- Level 0 (no dependencies): task-1 and task-2 spawn **simultaneously**
- Level 1 (depends on L0): task-3 spawns **after** task-1 and task-2 complete

## Bot Roles

### Scout
**Responsibility:** Gather information and assess resources

**Actions:**
- Explore the area
- Check available resources
- Identify challenges
- Write scout-report.md

**Output:** `.mindcraft-agents/context/scout-report.md`

### Architect
**Responsibility:** Create detailed plan based on Scout findings

**Actions:**
- Read scout-report.md
- Design the solution
- Create step-by-step plan
- Identify parallelizable tasks
- Write architecture.md

**Output:**
- `.mindcraft-agents/context/architecture.md`
- `.mindcraft-agents/context/build-tasks.json` (optional)

### Builder
**Responsibility:** Execute the Architect's plan

**Actions:**
- Read architecture.md
- Place blocks
- Craft items
- Follow the plan precisely
- Coordinate with other builders (if multiple)

**Output:** Minecraft blocks placed in-game

### Tester
**Responsibility:** Verify build matches plan

**Actions:**
- Read architecture.md
- Inspect the structure
- Test functionality (doors, chests, etc.)
- Check for issues
- Write test-report.md

**Output:** `.mindcraft-agents/context/test-report.md`

## Example Use Cases

### Example 1: Build a House

```
User: "andy, use the orchestration system to build a house"
Andy: !orchestrateTask("Build house", "Create a 10x10 wooden house with oak planks, glass windows, oak door, and interior furnishings")

[Scout spawns]
Scout: Exploring area... Found oak trees nearby. Checking for stone. Found flat area at 100,64,200.
Scout: [Writes scout-report.md]
Scout: [Complete]

[Architect spawns]
Architect: Reading scout findings... Oak wood available. Flat area identified.
Architect: Designing 10x10 house with 3-block walls, glass windows, oak door.
Architect: [Writes architecture.md]
Architect: [Complete]

[Builder spawns]
Builder: Reading architecture... Starting build at 100,64,200.
Builder: [STATUS] Clearing area
Builder: [STATUS] Foundation complete
Builder: [STATUS] Walls 50% complete
Builder: [STATUS] Walls complete
Builder: [STATUS] Adding roof
Builder: [STATUS] Placing interior items
Builder: [Complete]

[Tester spawns]
Tester: Inspecting structure... Checking dimensions... Testing door... Verifying windows...
Tester: All checks passed! ✅
Tester: [Writes test-report.md]
Tester: [Complete]

Andy: "House complete! All phases passed. 4 bots used in 312 seconds."
```

### Example 2: Create a Farm

```
Andy: !orchestrateTask("Create wheat farm", "Build a 9x9 wheat farm with water source, tilled soil, and fence perimeter")

[Scout] Finds water source, checks for seeds, identifies flat area
[Architect] Designs 9x9 farm layout with center water channel
[Builder] Digs channel, tills soil, plants seeds, builds fence
[Tester] Verifies farm is functional, checks lighting

Result: Fully functional wheat farm ✅
```

### Example 3: Parallel Resource Gathering

```
Andy: !orchestrateTask("Gather resources", "Collect materials for building: 200 logs, 100 cobble, 50 iron")

[Scout] Identifies nearby trees, stone, and caves
[Architect] Creates parallel task breakdown:
  - Task 1: Chop 200 logs (no dependencies)
  - Task 2: Mine 100 cobblestone (no dependencies)
  - Task 3: Mine 50 iron ore (no dependencies)
[Builders] 3 builders spawn simultaneously:
  - builder-1: Chops logs
  - builder-2: Mines cobblestone
  - builder-3: Mines iron ore
  (All work in parallel!)
[Tester] Verifies all resources collected

Result: Resources gathered 3x faster! ✅
```

## Configuration

### Enable/Disable Parallel Execution

When calling `!orchestrateTask`, set the parallel parameter:

```
!orchestrateTask("Build house", "Description...", true)   // Parallel enabled (default)
!orchestrateTask("Build house", "Description...", false)  // Sequential only
```

### Customize Bot Prompts

Edit the prompt files to change bot behavior:

- `src/orchestration/prompts/scout_prompt.txt`
- `src/orchestration/prompts/architect_prompt.txt`
- `src/orchestration/prompts/builder_prompt.txt`
- `src/orchestration/prompts/tester_prompt.txt`

## Troubleshooting

### Bots Don't Spawn

**Check:**
1. Verify andy successfully executed the command
2. Check `.mindcraft-agents/profiles/` for profile JSON files
3. Check for errors in console logs

### Bot Gets Stuck

**Check:**
1. Look at `.mindcraft-agents/logs/<bot-id>.log` for errors
2. Check if bot is waiting for resources
3. Verify `.done` file was created

### Parallel Tasks Don't Execute

**Check:**
1. Verify `parallel: true` parameter
2. Check if Architect created `build-tasks.json`
3. Look for dependency cycles in tasks

### Build Doesn't Match Plan

**Check:**
1. Read `.mindcraft-agents/context/test-report.md` for issues
2. Review `.mindcraft-agents/context/architecture.md` vs actual build
3. Check builder logs for errors

## Comparison: Old vs New

### Old Way (Manual Profiles)
```javascript
// settings.js
"profiles": [
    "./andy.json",
    "./profiles/miner.json",      // Hardcoded
    "./profiles/builder.json",    // Hardcoded
    "./profiles/farmer.json"      // Hardcoded
]
```

**Problems:**
- Must manually add each bot to settings.js
- All bots spawn at startup
- No coordination between bots
- Restart required to add/remove bots

### New Way (Orchestration)
```javascript
// In-game command
!orchestrateTask("Build house", "Create a 10x10 house")
```

**Benefits:**
- ✅ Bots spawn dynamically on-demand
- ✅ Automatic coordination (files + chat)
- ✅ Roles assigned automatically (Scout/Architect/Builder/Tester)
- ✅ Parallel execution when possible
- ✅ No restarts required
- ✅ No settings.js changes needed

## Architecture

### Key Components

1. **BotOrchestrator** (`src/orchestration/bot_orchestrator.js`)
   - Manages bot lifecycle
   - Spawns bots as Node.js processes
   - Tracks completion via `.done` files
   - Handles parallel execution with dependency resolution

2. **MCP Commands** (`src/agent/commands/mcp.js`)
   - `!orchestrateTask` - Full workflow
   - `!spawnBot` - Single bot
   - `!botStatus` - Check progress
   - `!listBots` - List active bots

3. **Coordination Manager** (`src/orchestration/coordination.js`)
   - File-based context sharing
   - Chat history tracking
   - Directed message parsing

4. **Role Prompts** (`src/orchestration/prompts/*.txt`)
   - Scout instructions
   - Architect instructions
   - Builder instructions
   - Tester instructions

## Future Enhancements

### Potential Improvements

1. **Visual Progress Tracking**
   - Web UI showing bot status in real-time
   - Progress bars for each phase
   - Live log streaming

2. **Advanced Coordination**
   - Bot-to-bot item trading
   - Shared inventory management
   - Automatic conflict resolution

3. **Specialized Roles**
   - Defender (protects builders from mobs)
   - Supplier (brings materials to builders)
   - Scout variations (combat scout, resource scout)

4. **Task Templates**
   - Predefined architectures for common builds
   - Template library: houses, farms, mines, etc.
   - Quick-start templates

5. **Learning System**
   - Bots remember successful strategies
   - Architecture patterns improve over time
   - Failure analysis and adaptation

## Credits

Inspired by [context-foundry](https://github.com/context-foundry/context-foundry)'s multi-agent orchestration pattern, adapted for Minecraft gameplay instead of software development.

**Key Differences:**
- context-foundry: Spawns Claude Code instances for building software
- mindcraft orchestration: Spawns Minecraft bots for gameplay tasks
- Both use: File-based coordination, parallel execution, role specialization
