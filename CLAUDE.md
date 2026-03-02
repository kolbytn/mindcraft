# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mindcraft is an AI-powered Minecraft bot framework (research fork v0.1.3) where multiple LLMs play Minecraft autonomously. This fork adds a **Hybrid Research Rig** with:
- **CloudGrok** — cloud ensemble bot: 4 panel models (Gemini + Grok) voted by a heuristic arbiter + optional LLM judge; always-on on EC2
- **DragonSlayer** — local GPU bot (currently active): `sweaterdog/andy-4:q8_0` via Ollama on RTX 3090; autonomous Ender Dragon speedrun with RC29 persistent state
- **LocalAndy** — local GPU bot (dormant): `sweaterdog/andy-4` via Ollama; research/exploration profile
- All bots connect to one persistent Minecraft server on AWS EC2 (Paper 1.21.11) with ChromaDB-backed memory

This is an **ES module** project (`"type": "module"` in package.json). Use `import`/`export`, not `require`.

## Commands

```bash
npm install              # Install deps (runs patch-package postinstall automatically)
npm start                # Start bots: node main.js
npm run lint             # ESLint with 0-warning tolerance (enforced pre-commit via husky)
npm test                 # No-op (no tests configured)

# Run DragonSlayer (current active local bot — connects to EC2 server)
node main.js --profiles ./profiles/dragon-slayer.json

# Run a specific bot profile
node main.js --profiles ./profiles/ensemble.json

# Run with task automation
node main.js --task_path tasks/basic/single_agent.json --task_id gather_oak_logs

# EC2 deployment (run on EC2 instance)
bash aws/ec2-go.sh           # Quick restart (code pull + rebuild)
bash aws/ec2-go.sh --full    # Full redeploy (+ secrets from SSM)
bash aws/ec2-go.sh --secrets # Refresh API keys from AWS SSM only

# Windows launcher
.\start.ps1 both             # Start both bots
.\start.ps1 local -Detach    # Start local bot detached
.\start.ps1 stop             # Stop all
```

## Architecture

### Entry Point & Agent Lifecycle
`main.js` → parses profiles from `settings.js` → spawns one `Agent` per profile via `src/process/agent_process.js` → each agent connects to Minecraft via mineflayer.

### Core Agent Loop (`src/agent/`)
- **`agent.js`** — Main `Agent` class: event handling, conversation loop (`promptConvo()`), mode management
- **`action_manager.js`** — Validates and executes `!commands` (e.g., `!collectBlocks`, `!goToPlayer`)
- **`conversation.js`** — Chat message routing; inter-bot messaging protocol
- **`coder.js`** — JavaScript code execution in an SES sandbox
- **`modes.js`** — Behavioral modes: survival, cowardice, hunting, etc.
- **`history.js`** / **`memory_bank.js`** / **`learnings.js`** — Persistent memory across sessions
- **`library/skills.js`** — All in-game action implementations (~89k LOC)
- **`library/world.js`** — World navigation and block/entity queries

### Ensemble Decision Pipeline (`src/ensemble/`)
The `EnsembleModel` class in `controller.js` runs a 3-phase decision process on every LLM call:
1. **Panel** (`panel.js`) — Queries all 4 panel models in parallel
2. **Arbiter** (`arbiter.js`) — Scores responses heuristically (length, completeness, action quality, latency). If top 2 scores are within 0.08 margin, escalates to Judge.
3. **Judge** (`judge.js`) — LLM-as-Judge (Gemini Flash) picks the best response; 10s timeout
4. **ChromaDB Memory** (`feedback.js`) — Embeds recent context, retrieves similar past decisions (similarity > 0.6), injects as `[PAST EXPERIENCE]` before panel queries, then logs outcome for future retrieval

Every ensemble decision is written to `bots/{BotName}/ensemble_log.json`.

### Model Abstraction (`src/models/`)
- **`_model_map.js`** — Dynamically discovers all provider modules
- **`prompter.js`** — Unified prompt builder: injects `$MEMORY`, `$INVENTORY`, `$STATS`, `$EXAMPLES` into system prompt
- **`{provider}.js`** — 23 provider implementations (gpt, gemini, grok, claude, ollama, etc.)

Model routing: a string like `"gemini-2.5-pro"` is auto-matched to its provider; `"openrouter/google/gemini-2.5-pro"` uses explicit routing; profile can also pass an object `{ api, model, url, params }`.

### Configuration
- **`settings.js`** — Global defaults. Override any key via `SETTINGS_JSON` env var (prototype-pollution protected). API keys in `.env` take priority over `keys.json`.
- **`profiles/*.json`** — Per-bot personality, model selection, system prompts, and per-profile `blocked_actions`. Profiles inherit from `profiles/defaults/{base_profile}.json`.
- **`src/utils/keys.js`** — Loads API keys; env vars always override `keys.json`.

### Web UI & Multi-Agent
- **`src/mindcraft/mindserver.js`** — WebSocket server on port 8080; hosts HUD overlay and bot registry
- **`src/mindcraft/public/`** — Frontend HUD with per-bot runtime, goal, and command log
- Multiple bots share one MindServer. Inter-bot messaging uses `!startConversation()` protocol and an alias system (`/msg gk` → `Grok_En`).

### Security Guards (do not remove)
- `src/utils/message_validator.js` — Injection detection and char sanitization on all chat input
- `src/utils/rate_limiter.js` — Per-user rate limiting
- `settings.js` `deepSanitize()` — Prototype pollution guard on `SETTINGS_JSON`
- `discord-bot.js` — Path traversal guard on profile loading; command injection detection
- `allow_insecure_coding: false` by default (controls `!newAction` code execution)

## Key Configuration Notes

- **Node.js**: v18+ required; v20 LTS recommended; v24+ may cause issues
- **Minecraft version**: Set `minecraft_version` in `settings.js` (default `"auto"` for up to v1.21.6)
- **EC2 server**: set `host` in `settings.js` to your EC2 public IP; `port: 19565` (non-default external port, internal 25565)
- **Docker host**: `"host": "minecraft-server"` is the Docker service name; change to `"localhost"` for non-Docker runs
- **Vision**: Requires `LIBGL_ALWAYS_SOFTWARE=1` and Xvfb (only works in Docker); prismarine-viewer canvas bindings broken on Windows
- **Active local profile**: `profiles/dragon-slayer.json` — DragonSlayer bot with `sweaterdog/andy-4:q8_0` via Ollama
- **Ensemble profile**: `profiles/ensemble.json` — CloudGrok config with 4-panel voting (runs on EC2)
- **Whitelist**: `ENFORCE_WHITELIST=TRUE`; `whitelist.json` mounted into container with pre-built offline UUIDs. **Do not** use the `WHITELIST` env var — it queries Playerdb and crashes for offline-mode bot names.

## Deployment Topologies

| Mode | Compose File | Notes |
|------|-------------|-------|
| Local dev | `docker-compose.yml` | Ollama on host via `host.docker.internal:11434` |
| EC2 production | `docker-compose.aws.yml` | Includes LiteLLM proxy (:4000), ChromaDB, Tailscale sidecar |
| Local bot → EC2 server | `settings.js` | set `host` to EC2 public IP, `port: 19565`; bot on Windows, server on EC2 |
| EC2 production | `docker-compose.aws.yml` | Includes LiteLLM proxy (:4000), ChromaDB, Tailscale sidecar |

AWS secrets managed via SSM Parameter Store; `aws/ec2-go.sh --secrets` pulls and writes them.
