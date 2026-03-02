
import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { io } from 'socket.io-client';
import { readFile, writeFile } from 'fs/promises';
import { readFileSync } from 'fs';
import { join, dirname, resolve, sep } from 'path';
import { fileURLToPath } from 'url';
import { validateDiscordMessage } from './src/utils/message_validator.js';
import { RateLimiter } from './src/utils/rate_limiter.js';
import { deepSanitize } from './settings.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILES_DIR = join(__dirname, 'profiles');
const ACTIVE_PROFILES = ['cloud-persistent', 'local-research', 'claude-explorer'];

// ── Admin Authorization ──────────────────────────────────────
// Comma-separated Discord user IDs allowed to run destructive commands.
// If empty, only users with the admin role (default "admin") are allowed.
const ADMIN_USER_IDS = (process.env.DISCORD_ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const DISCORD_ADMIN_ROLE = (process.env.DISCORD_ADMIN_ROLE || 'admin').toLowerCase();
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';

if (ADMIN_USER_IDS.length === 0) {
    console.warn('[Auth] DISCORD_ADMIN_IDS is empty — only users with the admin role can run destructive commands.');
}

function isAdmin(userId, member) {
    // Check explicit user ID list
    if (ADMIN_USER_IDS.includes(userId)) return true;
    // Check Discord server role (guild messages only)
    if (member?.roles?.cache?.some(r => r.name.toLowerCase() === DISCORD_ADMIN_ROLE)) return true;
    return false;
}

// ── Profile Name Validation ──────────────────────────────────
// Only allow alphanumeric, underscore, and hyphen characters to prevent
// path traversal attacks when profile names are used in file paths.
function isValidProfileName(name) {
    return typeof name === 'string' && /^[a-zA-Z0-9_-]+$/.test(name) && name.length <= 64;
}

function safeProfilePath(name) {
    if (!isValidProfileName(name)) {
        throw new Error(`Invalid profile name: "${name}"`);
    }
    const filePath = join(PROFILES_DIR, `${name}.json`);
    const resolvedDir = resolve(PROFILES_DIR);
    const resolvedFile = resolve(filePath);
    if (!resolvedFile.startsWith(resolvedDir + sep)) {
        throw new Error(`Path traversal detected for profile: "${name}"`);
    }
    return filePath;
}

// ── Bot Groups (name → agent names) ─────────────────────────
// Reads agent names from profile JSON files at startup so the map
// stays in sync with whatever profiles are configured.
function loadProfileAgentMap() {
    const map = {};
    for (const profileName of ACTIVE_PROFILES) {
        try {
            const filePath = safeProfilePath(profileName);
            const profile = deepSanitize(JSON.parse(readFileSync(filePath, 'utf8')));
            if (profile.name) map[profileName] = profile.name;
        } catch { /* profile may not exist yet */ }
    }
    return map;
}
const PROFILE_AGENT_MAP = loadProfileAgentMap();
const allAgentNames = Object.values(PROFILE_AGENT_MAP);
const BOT_GROUPS = {
    all:      allAgentNames.length > 0 ? allAgentNames : ['CloudGrok', 'LocalAndy'],
    cloud:    allAgentNames.filter(n => PROFILE_AGENT_MAP['cloud-persistent'] === n),
    local:    allAgentNames.filter(n => PROFILE_AGENT_MAP['local-research'] === n),
    research: allAgentNames.length > 0 ? [...allAgentNames] : ['LocalAndy', 'CloudGrok'],
};
console.log('[Boot] Profile→Agent map:', JSON.stringify(PROFILE_AGENT_MAP));

// ── Aliases (shorthand → canonical agent name) ──────────────
// Build aliases dynamically from discovered names, with static fallbacks
const cloudAgent = PROFILE_AGENT_MAP['cloud-persistent'] || 'CloudGrok';
const localAgent = PROFILE_AGENT_MAP['local-research'] || 'LocalAndy';
const AGENT_ALIASES = {
    'cloud':    cloudAgent,
    'cg':       cloudAgent,
    'grok':     cloudAgent,
    'local':    localAgent,
    'la':       localAgent,
    'andy':     localAgent,
};

/**
 * Resolve a user argument to a list of agent names.
 * Supports: exact agent names, group names, or comma-separated.
 * Returns: { agents: string[], label: string }
 */
function resolveAgents(arg) {
    if (!arg) return { agents: [], label: 'none' };

    // Check for comma-separated list
    const parts = arg.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
    const resolved = [];
    const labels = [];

    for (const part of parts) {
        const lower = part.toLowerCase();

        // Group match
        if (BOT_GROUPS[lower]) {
            resolved.push(...BOT_GROUPS[lower]);
            labels.push(`group:${lower}`);
            continue;
        }

        // Alias match
        if (AGENT_ALIASES[lower]) {
            resolved.push(AGENT_ALIASES[lower]);
            labels.push(AGENT_ALIASES[lower]);
            continue;
        }

        // Exact agent name match (case-insensitive)
        const agent = knownAgents.find(a => a.name.toLowerCase() === lower);
        if (agent) {
            resolved.push(agent.name);
            labels.push(agent.name);
            continue;
        }

        // Partial match (prefix)
        const partial = knownAgents.filter(a => a.name.toLowerCase().startsWith(lower));
        if (partial.length > 0) {
            resolved.push(...partial.map(a => a.name));
            labels.push(...partial.map(a => a.name));
            continue;
        }

        // Unknown — pass through as-is (MindServer may know it)
        resolved.push(part);
        labels.push(part);
    }

    // Deduplicate
    const unique = [...new Set(resolved)];
    return { agents: unique, label: labels.join(', ') };
}

// ── Config ──────────────────────────────────────────────────
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || '';
const BOT_DM_CHANNEL = process.env.BOT_DM_CHANNEL || '';
const BACKUP_CHAT_CHANNEL = process.env.BACKUP_CHAT_CHANNEL || '';
const MINDSERVER_HOST = process.env.MINDSERVER_HOST || 'mindcraft';
const MINDSERVER_PORT = process.env.MINDSERVER_PORT || 8080;
// Optional secondary MindServer for local PC bots (e.g. Tailscale IP)
// Set LOCAL_MINDSERVER_URL to connect to a second MindServer running locally
// Example: LOCAL_MINDSERVER_URL=http://100.x.x.x:8080
const LOCAL_MINDSERVER_URL = process.env.LOCAL_MINDSERVER_URL || '';

// ── Discord Client ──────────────────────────────────────────
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel, Partials.Message]
});

// ── State ───────────────────────────────────────────────────
let mindServerSocket = null;
let mindServerConnected = false;
let knownAgents = [];      // [{name, in_game, socket_connected, viewerPort}]
let agentStates = {};      // {agentName: {gameplay, action, inventory, nearby, ...}}
let replyChannel = null;   // cached Discord channel for fast replies

// ── Local MindServer State ──────────────────────────────────
let localMindServerSocket = null;
let localMindServerConnected = false;
let localKnownAgents = [];  // agents from local PC MindServer
let localAgentStates = {};  // states from local PC MindServer
const messageLimiter = new RateLimiter(3, 60000);  // 3 messages per 60 seconds per user

// ── Gemini Helper (shared by auto-fix and direct chat) ────────
async function callGemini(systemPrompt, userMessage, history = []) {
    if (!GOOGLE_API_KEY) return null;
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_API_KEY}`;
        const contents = [
            ...history,
            { role: 'user', parts: [{ text: userMessage }] }
        ];
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                system_instruction: { parts: [{ text: systemPrompt }] },
                contents,
                generationConfig: { maxOutputTokens: 600, temperature: 0.7 }
            })
        });
        if (!res.ok) { console.error(`[Gemini] API error ${res.status}`); return null; }
        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
    } catch (err) {
        console.error('[Gemini] Error:', err.message);
        return null;
    }
}

// ── Chat Buffer (feeds auto-fix and direct chat context) ──────
const chatBuffer = {};          // { agentName: [{speaker, text, timestamp}] }
const CHAT_BUFFER_SIZE = 20;

function addToChatBuffer(agentName, speaker, text) {
    if (!chatBuffer[agentName]) chatBuffer[agentName] = [];
    chatBuffer[agentName].push({ speaker, text, timestamp: Date.now() });
    if (chatBuffer[agentName].length > CHAT_BUFFER_SIZE) chatBuffer[agentName].shift();
}

function buildChatBufferText(limit = 20) {
    const all = [];
    for (const msgs of Object.values(chatBuffer)) {
        for (const m of msgs) all.push(m);
    }
    all.sort((a, b) => a.timestamp - b.timestamp);
    return all.slice(-limit).map(m => `[${m.speaker}]: ${m.text}`).join('\n');
}

// ── Auto-Fix Monitor ─────────────────────────────────────────
let autofixEnabled = process.env.AUTOFIX_ENABLED !== 'false';
const AUTOFIX_COOLDOWN_MS = 60000;  // 1 min between fixes per bot
const AUTOFIX_CHECK_EVERY = 5;      // analyse every N new chat messages
let chatMessageCount = 0;
const lastAutoFix = {};             // { botName: timestamp }

const AUTOFIX_SYSTEM =
`You monitor Minecraft AI bot coordination chat. Detect if a bot is stuck or failing.

Issues to detect:
- Death loop: bot repeatedly dying, health 0/20, starvation mentioned multiple times
- Forgotten task: bot ignores an active delivery/collection request mid-task
- Item loss loop: bot keeps losing the same items it collected (3+ times)
- Stuck action: identical failure repeated 3+ times in a row
- Gathering loop: bot reports "Collected 0" or "No <item> nearby" multiple times, or keeps retrying !collectBlocks for the same resource. Fix: tell bot to use !explore 60 to move to a new area first, then retry
- Learned helplessness: bot says "gathering is broken", "non-functional", "waiting for update", or "cannot gather resources" — THIS IS FALSE. All commands work correctly. The bot has a stale memory from an old bug. Fix: tell bot "Your gathering commands work perfectly. Stop saying they are broken. Use !explore 80 to move to a new area, then !collectBlocks to gather. The system is fixed."
- Cross-contamination: one bot tells another that "gathering is broken" or "commands don't work" — BOTH bots need correcting
- Context reset: bot re-introduces itself mid-task as if meeting another bot for the first time

If an issue is found, respond ONLY with this exact JSON (no markdown, no extra text):
{"issue":true,"bot":"ExactBotName","message":"corrective instruction under 80 words"}

If no issue:
{"issue":false}`;

async function runAutoFix() {
    if (!autofixEnabled || !GOOGLE_API_KEY || (!mindServerConnected && !localMindServerConnected)) return;

    // Fetch last 10 Discord messages for context
    let recentChat = '';
    try {
        if (client.isReady() && BACKUP_CHAT_CHANNEL) {
            const channel = await client.channels.fetch(BACKUP_CHAT_CHANNEL).catch(() => null);
            if (channel && channel.messages) {
                const msgs = await channel.messages.fetch({ limit: 10 });
                recentChat = msgs.reverse()
                    .map(m => `${m.author.username}: ${m.content.substring(0, 100)}`)
                    .join('\n');
            }
        }
    } catch (_e) {
        // Fallback to buffer if channel fetch fails
    }

    const contextText = recentChat || buildChatBufferText();
    if (!contextText) return;

    try {
        const raw = await callGemini(AUTOFIX_SYSTEM, contextText);
        if (!raw) return;
        console.debug('[AutoFix] Raw:', raw);
        const cleaned = raw.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
        const result = JSON.parse(cleaned);
        if (!result.issue || !result.bot || !result.message) return;
        // Sanitize LLM output: cap length and strip leading ! to prevent
        // bot command injection (e.g. Gemini hallucinating "!newAction ...").
        const rawMsg = String(result.message).slice(0, 150).replace(/^!+/, '').trim();
        if (!rawMsg) return;
        result.message = rawMsg;
        const now = Date.now();
        if (lastAutoFix[result.bot] && (now - lastAutoFix[result.bot]) < AUTOFIX_COOLDOWN_MS) return;
        const sent = sendToAgent(result.bot, result.message, 'AutoFix');
        if (sent.sent) {
            lastAutoFix[result.bot] = now;
            await sendToDiscord(`🔧 **AutoFix → ${result.bot}**: "${result.message}"`);
            console.log(`[AutoFix] Sent to ${result.bot}: ${result.message}`);
        }
    } catch (err) {
        console.error('[AutoFix] Parse error:', err.message);
    }
}

// ── Direct Bot Chat ──────────────────────────────────────────
const directChatHistory = [];   // multi-turn conversation history
const MAX_DIRECT_HISTORY = 20;

const DIRECT_CHAT_SYSTEM_TEMPLATE =
`You are Mindcraft Bot Manager, the AI control interface for a Minecraft bot management system. Help the admin monitor and manage their bots.

Bots:
- CloudGrok: cloud ensemble (Gemini + Grok panel), persistent survival, maintains base
- LocalAndy: research and exploration bot

Respond concisely. Reference live state data when available. Suggest Discord commands where helpful (e.g. !freeze, !restart, !stats, !inv, !stop).

Live agent states:
$STATES

Recent bot chat:
$CHAT`;

async function handleDirectChat(userMessage) {
    if (!GOOGLE_API_KEY) return '❌ `GOOGLE_API_KEY` not configured — direct chat unavailable.';
    const states = Object.entries(agentStates).map(([name, s]) => {
        const gp = s?.gameplay || {};
        const act = s?.action || {};
        return `${name}: hp=${gp.health ?? '?'}/20 food=${gp.hunger ?? '?'}/20 pos=${formatPos(gp.position)} action=${act.current || (act.isIdle ? 'idle' : '?')}`;
    }).join('\n') || 'No agents connected';
    const recentChat = buildChatBufferText(15) || 'No recent chat';
    const system = DIRECT_CHAT_SYSTEM_TEMPLATE
        .replace('$STATES', states)
        .replace('$CHAT', recentChat);
    const history = directChatHistory.slice(-MAX_DIRECT_HISTORY);
    const reply = await callGemini(system, userMessage, history);
    if (reply) {
        directChatHistory.push({ role: 'user', parts: [{ text: userMessage }] });
        directChatHistory.push({ role: 'model', parts: [{ text: reply }] });
        if (directChatHistory.length > MAX_DIRECT_HISTORY) directChatHistory.splice(0, 2);
    }
    return reply || '❌ No response from Gemini.';
}

// ── Help Text ───────────────────────────────────────────────
const HELP_TEXT = `**Mindcraft Bot Manager — Command Center**
🔒 = requires the \`admin\` Discord role (or your user ID in \`DISCORD_ADMIN_IDS\`)

**Chat with bots:**
Just type a message → goes to ALL active bots
Target one: \`andy: go mine diamonds\` | \`cg: come here\`
Aliases: \`cloud\`/\`cg\`/\`grok\` = CloudGrok | \`local\`/\`la\`/\`andy\` = LocalAndy
Groups: \`all\` \`cloud\` \`local\` \`research\` | Comma-separate targets: \`cg, andy\`

**Talk to Mindcraft Bot Manager directly:**
\`bot: <question>\` — Chat with the bot itself (live agent state + recent chat context)
DM the bot — same as \`bot:\`, works even when MindServer is offline

**Monitoring:**
\`!status\` — Agent overview (health, hunger, position, online/offline)
\`!agents\` — Quick agent connection status
\`!stats [bot]\` — Detailed gameplay stats (biome, weather, current action)
\`!inv [bot]\` — Inventory contents and equipped gear
\`!nearby [bot]\` — Nearby players, bots, and mobs
\`!viewer\` — MindServer dashboard link (bot cameras + stats)
\`!usage [bot|all]\` — API token counts and cost breakdown
\`!autofix\` — Toggle auto-fix on/off 🔒 | \`!autofix status\` — monitor details

**Controls:** 🔒
\`!start <bot|group>\` — Start bot(s)
\`!startall\` — Start every bot
\`!stop [bot|group]\` — Stop bot(s) (default: all)
\`!stopall\` — Stop every bot
\`!restart <bot|group>\` — Restart bot(s)
\`!freeze [bot|group]\` — Instant in-game halt, no LLM (default: all)

**System:**
\`!mode [cloud|local|hybrid] [profile]\` — View or switch compute mode 🔒
\`!reconnect\` — Reconnect to MindServer 🔒
\`!ui\` / \`!mindserver\` — MindServer dashboard URL
\`!ping\` — Latency check

**Auto-Fix:** Watches bot chat every 5 messages, auto-corrects death loops, forgotten tasks, item loss, and context resets (60s cooldown per bot). Toggle with \`!autofix\` or set \`AUTOFIX_ENABLED=false\` at startup.`;

// ── MindServer Connection ───────────────────────────────────
function connectToMindServer() {
    const url = `http://${MINDSERVER_HOST}:${MINDSERVER_PORT}`;
    console.log(`📡 Connecting to MindServer at ${url}`);

    if (mindServerSocket) {
        mindServerSocket.removeAllListeners();
        mindServerSocket.disconnect();
    }

    mindServerSocket = io(url, {
        reconnection: true,
        reconnectionDelay: 2000,
        reconnectionDelayMax: 10000,
        reconnectionAttempts: Infinity,
        timeout: 10000
    });

    mindServerSocket.on('connect', () => {
        mindServerConnected = true;
        console.log('✅ Connected to MindServer');
        mindServerSocket.emit('listen-to-agents');
    });

    mindServerSocket.on('disconnect', (reason) => {
        mindServerConnected = false;
        console.log(`⚠️ Disconnected from MindServer: ${reason}`);
    });

    // ── Agent output → Discord ──
    mindServerSocket.on('bot-output', async (agentName, message) => {
        console.log(`[Agent ${agentName}] ${message}`);
        await sendToDiscord(`🟢 **${agentName}**: ${message}`);
        addToChatBuffer(agentName, agentName, message);
        chatMessageCount++;
        if (chatMessageCount % AUTOFIX_CHECK_EVERY === 0) {
            runAutoFix().catch(err => console.error('[AutoFix]', err.message));
        }
    });

    mindServerSocket.on('chat-message', async (agentName, json) => {
        console.log(`[Agent Chat] ${agentName}: ${JSON.stringify(json)}`);
        if (json && json.message) {
            await sendToDiscord(`💬 **${agentName}**: ${json.message}`);
            addToChatBuffer(agentName, agentName, json.message);
            chatMessageCount++;
            if (chatMessageCount % AUTOFIX_CHECK_EVERY === 0) {
                runAutoFix().catch(err => console.error('[AutoFix]', err.message));
            }
        }
    });

    mindServerSocket.on('agents-status', (agents) => {
        knownAgents = agents || [];
        const summary = agents.map(a => `${a.name}${a.in_game ? '✅' : '⬛'}`).join(', ');
        console.log(`[Agents] ${summary}`);
    });

    mindServerSocket.on('state-update', (states) => {
        if (states) agentStates = { ...agentStates, ...states };
    });

    mindServerSocket.on('connect_error', (error) => {
        mindServerConnected = false;
        // Only log periodically to avoid spam
        console.error(`MindServer error: ${error.message}`);
    });
}

// ── Local MindServer Connection ─────────────────────────────
function connectToLocalMindServer() {
    if (!LOCAL_MINDSERVER_URL) return;

    console.log(`📡 Connecting to Local MindServer at ${LOCAL_MINDSERVER_URL}`);

    if (localMindServerSocket) {
        localMindServerSocket.removeAllListeners();
        localMindServerSocket.disconnect();
    }

    localMindServerSocket = io(LOCAL_MINDSERVER_URL, {
        reconnection: true,
        reconnectionDelay: 3000,
        reconnectionDelayMax: 15000,
        reconnectionAttempts: Infinity,
        timeout: 10000
    });

    localMindServerSocket.on('connect', () => {
        localMindServerConnected = true;
        console.log('✅ Connected to Local MindServer');
        localMindServerSocket.emit('listen-to-agents');
    });

    localMindServerSocket.on('disconnect', (reason) => {
        localMindServerConnected = false;
        localKnownAgents = [];
        console.log(`⚠️ Disconnected from Local MindServer: ${reason}`);
    });

    localMindServerSocket.on('bot-output', async (agentName, message) => {
        console.log(`[Local ${agentName}] ${message}`);
        await sendToDiscord(`🏠 **${agentName}**: ${message}`);
        addToChatBuffer(agentName, agentName, message);
        chatMessageCount++;
        if (chatMessageCount % AUTOFIX_CHECK_EVERY === 0) {
            runAutoFix().catch(err => console.error('[AutoFix]', err.message));
        }
    });

    localMindServerSocket.on('chat-message', async (agentName, json) => {
        if (json && json.message) {
            await sendToDiscord(`🏠💬 **${agentName}**: ${json.message}`);
            addToChatBuffer(agentName, agentName, json.message);
            chatMessageCount++;
            if (chatMessageCount % AUTOFIX_CHECK_EVERY === 0) {
                runAutoFix().catch(err => console.error('[AutoFix]', err.message));
            }
        }
    });

    localMindServerSocket.on('agents-status', (agents) => {
        localKnownAgents = agents || [];
        const summary = agents.map(a => `${a.name}${a.in_game ? '✅' : '⬛'}`).join(', ');
        console.log(`[Local Agents] ${summary}`);
    });

    localMindServerSocket.on('state-update', (states) => {
        if (states) localAgentStates = { ...localAgentStates, ...states };
    });

    localMindServerSocket.on('connect_error', (error) => {
        localMindServerConnected = false;
        console.error(`Local MindServer error: ${error.message}`);
    });
}

// ── Merged Agent Helpers ────────────────────────────────────
// Returns all agents from both MindServers, tagged with source
function getAllAgents() {
    const cloud = knownAgents.map(a => ({ ...a, _source: 'cloud' }));
    const local = localKnownAgents.map(a => ({ ...a, _source: 'local' }));
    return [...cloud, ...local];
}

function getAllAgentStates() {
    return { ...agentStates, ...localAgentStates };
}

// Find which socket an agent belongs to
function getAgentSocket(agentName) {
    const lower = agentName.toLowerCase();
    if (knownAgents.find(a => a.name.toLowerCase() === lower)) {
        return { socket: mindServerSocket, connected: mindServerConnected, source: 'cloud' };
    }
    if (localKnownAgents.find(a => a.name.toLowerCase() === lower)) {
        return { socket: localMindServerSocket, connected: localMindServerConnected, source: 'local' };
    }
    return null;
}

// ── Discord → Send ──────────────────────────────────────────
async function sendToDiscord(message) {
    try {
        if (!replyChannel) {
            replyChannel = await client.channels.fetch(BOT_DM_CHANNEL);
        }
        if (replyChannel) {
            const chunks = message.match(/[\s\S]{1,1990}/g) || [message];
            for (const chunk of chunks) {
                await replyChannel.send(chunk);
            }
        }
    } catch (error) {
        console.error('Discord send error:', error.message);
        replyChannel = null; // reset cache on error
    }
}

// ── MindServer → Send ───────────────────────────────────────
// Matches what MindServer expects:
//   socket.on('send-message', (agentName, data))
//   then agent receives: socket.on('send-message', (data))
//   where data = { from: 'username', message: 'text' }
function sendToAgent(agentName, message, fromUser = 'Discord') {
    // Try both MindServers — find which one owns this agent
    const allAgents = getAllAgents();
    const agent = allAgents.find(a => a.name.toLowerCase() === agentName.toLowerCase());
    if (!agent) return { sent: false, reason: `Agent "${agentName}" not found` };
    if (!agent.in_game) return { sent: false, reason: `Agent "${agentName}" is not in-game` };

    const target = getAgentSocket(agent.name);
    if (!target || !target.connected) return { sent: false, reason: `MindServer for "${agentName}" not connected` };

    try {
        target.socket.emit('send-message', agent.name, { from: fromUser, message });
        const tag = target.source === 'local' ? '🏠→' : '→';
        console.log(`[${tag} ${agent.name}] ${fromUser}: ${message}`);
        return { sent: true, agent: agent.name };
    } catch (error) {
        return { sent: false, reason: error.message };
    }
}

function sendToAllAgents(message, fromUser = 'Discord') {
    const allAgents = getAllAgents().filter(a => a.in_game);
    if (allAgents.length === 0) return { sent: false, agents: [], reason: 'No agents in-game' };

    const results = [];
    for (const agent of allAgents) {
        const result = sendToAgent(agent.name, message, fromUser);
        results.push(result);
    }
    return { sent: true, agents: allAgents.map(a => a.name), results };
}

// ── Helpers ─────────────────────────────────────────────────

// ── Mode Switching ──────────────────────────────────────────
const VALID_MODES = ['cloud', 'local', 'hybrid'];
const MODE_EMOJI = { cloud: '☁️', local: '🖥️', hybrid: '🔀' };

async function readProfileAsync(name) {
    const filePath = safeProfilePath(name);
    const data = await readFile(filePath, 'utf8');
    return deepSanitize(JSON.parse(data));
}

async function writeProfileAsync(name, data) {
    const filePath = safeProfilePath(name);
    await writeFile(filePath, JSON.stringify(data, null, 4) + '\n', 'utf8');
}

async function getActiveModeAsync(name) {
    try {
        const p = await readProfileAsync(name);
        return p._active_mode || 'unknown';
    } catch { return 'unreadable'; }
}

async function switchProfileMode(name, mode) {
    try {
        const profile = await readProfileAsync(name);
        if (!profile._modes) return { ok: false, reason: `No _modes config in ${name}.json` };
        const modeConfig = profile._modes[mode];
        if (!modeConfig) return { ok: false, reason: `Mode "${mode}" not defined for ${name}` };

        // Apply mode fields to top-level
        for (const [key, value] of Object.entries(modeConfig)) {
            if (key === 'compute_type') continue;
            profile[key] = value;
        }

        // Remove code_model if not in this mode
        if (profile.code_model && !modeConfig.code_model) {
            delete profile.code_model;
        }

        // Update compute type in conversing prompt
        if (profile.conversing && modeConfig.compute_type) {
            profile.conversing = profile.conversing.replace(
                /(?<=- Compute: )[^\n\\]+/,
                modeConfig.compute_type
            );
        }

        profile._active_mode = mode;
        await writeProfileAsync(name, profile);
        return { ok: true, compute: modeConfig.compute_type || mode };
    } catch (err) {
        return { ok: false, reason: err.message };
    }
}

async function handleModeCommand(arg, message) {
    const parts = arg.trim().split(/\s+/).filter(Boolean);

    // No args → show current modes
    if (parts.length === 0) {
        const lines = [];
        for (const name of ACTIVE_PROFILES) {
            const mode = await getActiveModeAsync(name);
            const emoji = MODE_EMOJI[mode] || '❓';
            lines.push(`• **${name}** — ${emoji} ${mode}`);
        }
        return `**Current Compute Modes:**\n${lines.join('\n')}\n\nUsage: \`!mode <cloud|local|hybrid> [profile]\``;
    }

    const mode = parts[0].toLowerCase();
    if (!VALID_MODES.includes(mode)) {
        return `❌ Invalid mode: \`${mode}\`. Valid: \`cloud\`, \`local\`, \`hybrid\``;
    }

    // Determine which profiles to switch
    const rawTargets = parts.length > 1
        ? parts.slice(1).map(p => p.toLowerCase().replace('.json', ''))
        : [...ACTIVE_PROFILES];

    // Validate all profile names before touching the filesystem
    const invalidTargets = rawTargets.filter(name => !isValidProfileName(name));
    if (invalidTargets.length > 0) {
        return `❌ Invalid profile name(s): ${invalidTargets.map(n => `\`${n}\``).join(', ')}. Profile names may only contain letters, numbers, hyphens, and underscores.`;
    }
    const targets = rawTargets;

    await message.channel.sendTyping();

    const results = [];
    for (const name of targets) {
        const result = await switchProfileMode(name, mode);  // Now async
        if (result.ok) {
            results.push(`✅ **${name}** → ${MODE_EMOJI[mode]} ${mode} (${result.compute})`);
        } else {
            results.push(`⚠️ **${name}** — ${result.reason}`);
        }
    }

    let reply = `**Mode Switch → ${mode.toUpperCase()}**\n${results.join('\n')}`;

    // Restart agents via MindServer if connected
    if (mindServerConnected) {
        reply += '\n\n🔄 Restarting agents...';
        for (const name of targets) {
            // Find the agent's in-game name from the profile
            try {
                const profile = await readProfileAsync(name);
                const agentName = profile.name || name;
                mindServerSocket.emit('restart-agent', agentName);
            } catch { /* skip */ }
        }
    } else {
        reply += '\n\n⚠️ MindServer not connected — restart agents manually or use `!reconnect` then `!restart <name>`.';
    }

    return reply;
}

// ── Agent Helpers ───────────────────────────────────────────
function getAgentStatusText() {
    const allAgents = getAllAgents();
    if (allAgents.length === 0) return 'No agents registered.';
    return allAgents.map(a => {
        const status = a.in_game ? '🟢 in-game' : (a.socket_connected ? '🟡 connected' : '🔴 offline');
        const tag = a._source === 'local' ? ' 🏠' : '';
        return `• **${a.name}**${tag} — ${status}`;
    }).join('\n');
}

function parseAgentPrefix(content) {
    // Check for "agentName: message" or "alias: message" pattern
    const colonIdx = content.indexOf(':');
    if (colonIdx > 0 && colonIdx < 30) {
        const possibleName = content.substring(0, colonIdx).trim().toLowerCase();
        const msg = content.substring(colonIdx + 1).trim();

        // Exact agent name match
        const agent = knownAgents.find(a => a.name.toLowerCase() === possibleName);
        if (agent) {
            return { agent: agent.name, message: msg };
        }

        // Alias match
        if (AGENT_ALIASES[possibleName]) {
            return { agent: AGENT_ALIASES[possibleName], message: msg };
        }
    }
    return null;
}

// ── Usage Formatting ────────────────────────────────────────
function formatAgentUsage(agentName, data) {
    if (!data || !data.totals) return `\n**${agentName}** — No data\n`;
    const t = data.totals;
    const rpm = data.rpm ?? 0;
    const tpm = data.tpm ?? 0;
    let text = `\n**${agentName}**\n`;
    text += `  Cost: **$${t.estimated_cost_usd.toFixed(4)} USD**\n`;
    text += `  Requests: **${t.calls.toLocaleString()}** | RPM: **${rpm}**\n`;
    text += `  Tokens: **${t.total_tokens.toLocaleString()}** `;
    text += `(${t.prompt_tokens.toLocaleString()} in / ${t.completion_tokens.toLocaleString()} out) | TPM: **${tpm.toLocaleString()}**\n`;

    if (data.models && Object.keys(data.models).length > 0) {
        for (const [model, m] of Object.entries(data.models)) {
            const prov = m.provider || '?';
            text += `  - \`${model}\` (${prov}): ${m.calls} calls, `;
            text += `${m.total_tokens.toLocaleString()} tokens, $${m.estimated_cost_usd.toFixed(4)}\n`;
        }
    }
    return text;
}

// ── State Display Formatters ────────────────────────────────
function formatHealth(hp) {
    if (hp == null) return '?';
    const hearts = Math.ceil(hp / 2);
    return `${'❤️'.repeat(Math.min(hearts, 10))} ${hp}/20`;
}

function formatHunger(hunger) {
    if (hunger == null) return '?';
    const drums = Math.ceil(hunger / 2);
    return `${'🍗'.repeat(Math.min(drums, 10))} ${hunger}/20`;
}

function formatPos(pos) {
    if (!pos) return 'Unknown';
    return `${Math.round(pos.x)}, ${Math.round(pos.y)}, ${Math.round(pos.z)}`;
}

function formatAgentStats(name, state) {
    if (!state || state.error) return `**${name}** — No data available`;
    const gp = state.gameplay || {};
    const act = state.action || {};
    const surr = state.surroundings || {};
    let text = `**${name}**\n`;
    text += `${formatHealth(gp.health)} | ${formatHunger(gp.hunger)}\n`;
    text += `📍 ${formatPos(gp.position)} (${gp.dimension || '?'})\n`;
    text += `🌿 ${gp.biome || '?'} | ${gp.weather || '?'} | ${gp.timeLabel || '?'}\n`;
    text += `⚡ ${act.current || (act.isIdle ? 'Idle' : '?')}\n`;
    text += `🧱 Standing on: ${surr.below || '?'}`;
    return text;
}

function formatAgentInventory(name, state) {
    if (!state || state.error) return `**${name}** — No data available`;
    const inv = state.inventory || {};
    const equip = inv.equipment || {};
    let text = `**${name} — Inventory** (${inv.stacksUsed || 0}/${inv.totalSlots || 36} slots)\n`;

    // Equipment
    const slots = [
        ['⛑️', equip.helmet], ['👕', equip.chestplate],
        ['👖', equip.leggings], ['👢', equip.boots], ['🗡️', equip.mainHand]
    ];
    const equipped = slots.filter(([, v]) => v).map(([e, v]) => `${e} ${v}`);
    if (equipped.length > 0) text += `**Equipped:** ${equipped.join(' | ')}\n`;

    // Items
    const counts = inv.counts || {};
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) {
        text += '*(empty)*';
    } else {
        text += entries.map(([item, count]) => `\`${item}\` x${count}`).join(', ');
    }
    return text;
}

function formatAgentNearby(name, state) {
    if (!state || state.error) return `**${name}** — No data available`;
    const nearby = state.nearby || {};
    let text = `**${name} — Nearby**\n`;
    const humans = nearby.humanPlayers || [];
    const bots = nearby.botPlayers || [];
    const entities = nearby.entityTypes || [];
    text += `👤 Players: ${humans.length > 0 ? humans.join(', ') : 'none'}\n`;
    text += `🤖 Bots: ${bots.length > 0 ? bots.join(', ') : 'none'}\n`;
    text += `🐾 Entities: ${entities.length > 0 ? entities.join(', ') : 'none'}`;
    return text;
}

// ── Discord Events ──────────────────────────────────────────
client.on('ready', async () => {
    console.log(`🤖 Logged in as ${client.user.tag}`);
    console.log(`📋 Channels: DM=${BOT_DM_CHANNEL}, Backup=${BACKUP_CHAT_CHANNEL}`);

    // Set guild nickname to "Mindcraft Bot Manager"
    for (const guild of client.guilds.cache.values()) {
        try {
            await guild.members.me?.setNickname('Mindcraft Bot Manager');
        } catch (_e) { /* may lack permission */ }
    }
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const isDM = !message.guild;
    const isTarget = isDM || message.channelId === BOT_DM_CHANNEL || message.channelId === BACKUP_CHAT_CHANNEL;
    if (!isTarget) return;

    const content = message.content.trim();
    const lower = content.toLowerCase();
    console.log(`[Discord] ${message.author.username}: ${content}`);

    // ── Rate Limiting ──
    const rateCheck = messageLimiter.checkLimit(message.author.id);
    if (!rateCheck.allowed) {
        await message.reply(`⏱️ Rate limited. Please wait ${rateCheck.retryAfterSeconds}s before sending another message.`);
        return;
    }

    try {
        // ── Natural language triggers ──
        if (lower === 'what can you do' || lower === 'what can you do?' || lower === 'help' || lower === '!help') {
            await message.reply(HELP_TEXT);
            return;
        }

        // ── Commands ──
        if (content.startsWith('!')) {
            const parts = content.split(/\s+/);
            const cmd = parts[0].toLowerCase();
            let arg = parts.slice(1).join(' ');

            switch (cmd) {
                case '!ping':
                    await message.reply('🏓 Pong!');
                    return;

                case '!autofix': {
                    if (arg.toLowerCase() === 'status') {
                        // Status view — open to all users
                        const status = autofixEnabled ? '🟢 enabled' : '🔴 disabled';
                        const fixes = Object.entries(lastAutoFix)
                            .map(([bot, ts]) => `• **${bot}** — last fix ${Math.round((Date.now() - ts) / 1000)}s ago`);

                        let recent = 'empty';
                        try {
                            const msgs = await message.channel.messages.fetch({ limit: 10 });
                            if (msgs.size > 0) {
                                recent = msgs.reverse()
                                    .map(m => `${m.author.username}: ${m.content.substring(0, 80)}`)
                                    .join('\n');
                            }
                        } catch (_e) {
                            recent = '(could not fetch messages)';
                        }

                        let reply = `**Auto-Fix Monitor** — ${status}\n`;
                        reply += fixes.length > 0 ? fixes.join('\n') + '\n' : 'No fixes sent this session.\n';
                        reply += `\n**Last 10 messages** (monitored):\n\`\`\`\n${recent}\n\`\`\``;
                        await message.reply(reply.substring(0, 1990));
                    } else {
                        // Toggle — admin only
                        if (!isAdmin(message.author.id, message.member)) { await message.reply('⛔ This command requires admin privileges.'); return; }
                        autofixEnabled = !autofixEnabled;
                        await message.reply(`🔧 Auto-Fix is now **${autofixEnabled ? 'enabled 🟢' : 'disabled 🔴'}**`);
                    }
                    return;
                }

                case '!status': {
                    const ms = mindServerConnected ? '✅ Cloud MindServer connected' : '❌ Cloud MindServer disconnected';
                    const ls = LOCAL_MINDSERVER_URL
                        ? (localMindServerConnected ? '✅ Local MindServer connected' : '❌ Local MindServer disconnected')
                        : null;
                    const allAgentsForStatus = getAllAgents();
                    const allStates = getAllAgentStates();
                    const agentCount = allAgentsForStatus.length;
                    const inGame = allAgentsForStatus.filter(a => a.in_game).length;
                    let reply = `${ms}\n`;
                    if (ls) reply += `${ls}\n`;
                    reply += `📊 **${agentCount}** agents registered, **${inGame}** in-game\n\n`;
                    for (const agent of allAgentsForStatus) {
                        const status = agent.in_game ? '🟢 in-game' : (agent.socket_connected ? '🟡 connected' : '🔴 offline');
                        const tag = agent._source === 'local' ? ' 🏠' : ' ☁️';
                        reply += `• **${agent.name}**${tag} — ${status}`;
                        const st = allStates[agent.name];
                        if (agent.in_game && st && st.gameplay) {
                            const gp = st.gameplay;
                            reply += ` | ❤️${gp.health || '?'}  🍗${gp.hunger || '?'}  📍${formatPos(gp.position)}`;
                        }
                        reply += '\n';
                    }
                    await message.reply(reply);
                    return;
                }

                case '!agents':
                    await message.reply(`**Agent Status:**\n${getAgentStatusText()}`);
                    return;

                case '!reconnect':
                    if (!isAdmin(message.author.id, message.member)) { await message.reply('⛔ This command requires admin privileges.'); return; }
                    await message.reply('🔄 Reconnecting to MindServer(s)...');
                    connectToMindServer();
                    if (LOCAL_MINDSERVER_URL) connectToLocalMindServer();
                    return;

                case '!start': {
                    if (!isAdmin(message.author.id, message.member)) { await message.reply('⛔ This command requires admin privileges.'); return; }
                    if (!arg) { await message.reply('Usage: `!start <name|group>` — Groups: `all`, `gemini`, `grok`, `1`, `2`'); return; }
                    if (!mindServerConnected) { await message.reply('❌ MindServer not connected.'); return; }
                    const { agents: startTargets } = resolveAgents(arg);
                    for (const name of startTargets) mindServerSocket.emit('start-agent', name);
                    await message.reply(`▶️ Starting **${startTargets.join(', ')}**...`);
                    setTimeout(() => { sendToDiscord(`**Agent Status:**\n${getAgentStatusText()}`).catch(console.error); }, 5000);
                    return;
                }

                case '!stop': {
                    if (!isAdmin(message.author.id, message.member)) { await message.reply('⛔ This command requires admin privileges.'); return; }
                    if (!mindServerConnected) { await message.reply('❌ MindServer not connected.'); return; }
                    const stopArg = arg || 'all';
                    const { agents: stopTargets } = resolveAgents(stopArg);
                    for (const name of stopTargets) mindServerSocket.emit('stop-agent', name);
                    await message.reply(`⏹️ Stopping **${stopTargets.join(', ')}**...`);
                    setTimeout(() => { sendToDiscord(`**Agent Status:**\n${getAgentStatusText()}`).catch(console.error); }, 5000);
                    return;
                }

                case '!freeze': {
                    // Sends "freeze" as an in-game chat message to bots.
                    // The hardcoded intercept in agent.js catches "freeze" and
                    // calls actions.stop() + shut_up — no LLM involved.
                    if (!isAdmin(message.author.id, message.member)) { await message.reply('⛔ This command requires admin privileges.'); return; }
                    if (!mindServerConnected && !localMindServerConnected) { await message.reply('❌ No MindServer connected.'); return; }
                    const freezeArg = arg || 'all';
                    const { agents: freezeTargets } = resolveAgents(freezeArg);
                    const allAgentsFreeze = getAllAgents();
                    const inGame = freezeTargets.filter(n => allAgentsFreeze.find(a => a.name === n && a.in_game));
                    if (inGame.length === 0) {
                        await message.reply('❌ No matching agents are in-game.');
                        return;
                    }
                    for (const name of inGame) {
                        sendToAgent(name, 'freeze', message.author.username);
                    }
                    await message.reply(`🧊 Froze **${inGame.join(', ')}** — they will stop all actions immediately.`);
                    return;
                }

                case '!restart': {
                    if (!isAdmin(message.author.id, message.member)) { await message.reply('⛔ This command requires admin privileges.'); return; }
                    if (!arg) { await message.reply('Usage: `!restart <name|group>` — Groups: `all`, `gemini`, `grok`, `1`, `2`'); return; }
                    if (!mindServerConnected) { await message.reply('❌ MindServer not connected.'); return; }
                    const { agents: restartTargets } = resolveAgents(arg);
                    for (const name of restartTargets) mindServerSocket.emit('restart-agent', name);
                    await message.reply(`🔄 Restarting **${restartTargets.join(', ')}**...`);
                    setTimeout(() => { sendToDiscord(`**Agent Status:**\n${getAgentStatusText()}`).catch(console.error); }, 8000);
                    return;
                }

                case '!startall':
                    if (!isAdmin(message.author.id, message.member)) { await message.reply('⛔ This command requires admin privileges.'); return; }
                    if (!mindServerConnected) { await message.reply('❌ MindServer not connected.'); return; }
                    for (const name of BOT_GROUPS.all) mindServerSocket.emit('start-agent', name);
                    await message.reply(`▶️ Starting all agents: **${BOT_GROUPS.all.join(', ')}**...`);
                    setTimeout(() => { sendToDiscord(`**Agent Status:**\n${getAgentStatusText()}`).catch(console.error); }, 5000);
                    return;

                case '!stopall':
                    if (!isAdmin(message.author.id, message.member)) { await message.reply('⛔ This command requires admin privileges.'); return; }
                    if (!mindServerConnected) { await message.reply('❌ MindServer not connected.'); return; }
                    mindServerSocket.emit('stop-all-agents');
                    await message.reply('⏹️ Stopping all agents...');
                    setTimeout(() => { sendToDiscord(`**Agent Status:**\n${getAgentStatusText()}`).catch(console.error); }, 5000);
                    return;

                case '!mode': {
                    if (!isAdmin(message.author.id, message.member)) { await message.reply('⛔ This command requires admin privileges.'); return; }
                    const modeResult = await handleModeCommand(arg, message);
                    await message.reply(modeResult);
                    return;
                }

                case '!usage': {
                    if (!mindServerConnected) { await message.reply('MindServer not connected.'); return; }
                    await message.channel.sendTyping();

                    if (!arg || arg.toLowerCase() === 'all') {
                        let replied = false;
                        const timeout = setTimeout(async () => {
                            if (!replied) { replied = true; await message.reply('⏱️ Usage request timed out. Agents may be busy.'); }
                        }, 10000);
                        mindServerSocket.emit('get-all-usage', async (results) => {
                            if (replied) return;
                            replied = true;
                            clearTimeout(timeout);
                            if (!results || Object.keys(results).length === 0) {
                                await message.reply('No usage data available. Are any agents in-game?');
                                return;
                            }
                            let reply = '**API Usage Summary**\n';
                            let grandTotal = 0;
                            for (const [name, data] of Object.entries(results)) {
                                if (!data) continue;
                                grandTotal += data.totals?.estimated_cost_usd || 0;
                                reply += formatAgentUsage(name, data);
                            }
                            reply += `\n**Grand Total: $${grandTotal.toFixed(4)}**`;
                            await message.reply(reply);
                        });
                    } else {
                        const { agents: usageTargets } = resolveAgents(arg);
                        const target = usageTargets[0];
                        if (!target) { await message.reply(`Agent "${arg}" not found.`); return; }
                        let replied = false;
                        const timeout = setTimeout(async () => {
                            if (!replied) { replied = true; await message.reply('⏱️ Usage request timed out.'); }
                        }, 10000);
                        mindServerSocket.emit('get-agent-usage', target, async (response) => {
                            if (replied) return;
                            replied = true;
                            clearTimeout(timeout);
                            if (response.error) { console.error(`[Usage] Error for ${target}:`, response.error); await message.reply(`Error fetching usage for **${target}**.`); return; }
                            if (!response.usage) { await message.reply(`No usage data for **${target}**.`); return; }
                            const reply = '**API Usage Report**\n' + formatAgentUsage(target, response.usage);
                            await message.reply(reply);
                        });
                    }
                    return;
                }

                case '!stats': {
                    if (!mindServerConnected) { await message.reply('❌ MindServer not connected.'); return; }
                    if (!arg) {
                        // Show all agents
                        const lines = [];
                        for (const agent of knownAgents) {
                            if (agent.in_game && agentStates[agent.name]) {
                                lines.push(formatAgentStats(agent.name, agentStates[agent.name]));
                            } else {
                                lines.push(`**${agent.name}** — ${agent.in_game ? 'no state data' : 'offline'}`);
                            }
                        }
                        await message.reply(lines.join('\n\n') || 'No agents registered.');
                    } else {
                        const { agents: targets } = resolveAgents(arg);
                        const lines = targets.map(n => formatAgentStats(n, agentStates[n]));
                        await message.reply(lines.join('\n\n') || 'Agent not found.');
                    }
                    return;
                }

                case '!inv':
                case '!inventory': {
                    if (!mindServerConnected) { await message.reply('❌ MindServer not connected.'); return; }
                    if (!arg) {
                        const lines = [];
                        for (const agent of knownAgents) {
                            if (agent.in_game && agentStates[agent.name]) {
                                lines.push(formatAgentInventory(agent.name, agentStates[agent.name]));
                            }
                        }
                        await message.reply(lines.join('\n\n') || 'No in-game agents.');
                    } else {
                        const { agents: targets } = resolveAgents(arg);
                        const lines = targets.map(n => formatAgentInventory(n, agentStates[n]));
                        await message.reply(lines.join('\n\n') || 'Agent not found.');
                    }
                    return;
                }

                case '!nearby': {
                    if (!mindServerConnected) { await message.reply('❌ MindServer not connected.'); return; }
                    if (!arg) {
                        const lines = [];
                        for (const agent of knownAgents) {
                            if (agent.in_game && agentStates[agent.name]) {
                                lines.push(formatAgentNearby(agent.name, agentStates[agent.name]));
                            }
                        }
                        await message.reply(lines.join('\n\n') || 'No in-game agents.');
                    } else {
                        const { agents: targets } = resolveAgents(arg);
                        const lines = targets.map(n => formatAgentNearby(n, agentStates[n]));
                        await message.reply(lines.join('\n\n') || 'Agent not found.');
                    }
                    return;
                }

                case '!viewer': {
                    const host = process.env.PUBLIC_HOST || 'localhost';
                    const url = `http://${host}:${MINDSERVER_PORT}`;
                    let reply = `🖥️ **MindServer Dashboard**: <${url}>\nOpen in browser to view bot cameras, stats, and settings.`;
                    if (!process.env.PUBLIC_HOST) {
                        reply += '\n\n⚠️ `PUBLIC_HOST` not set — URL uses `localhost`. Set it to your server IP for remote access.';
                    }
                    await message.reply(reply);
                    return;
                }

                case '!ui':
                case '!mindserver':
                    await sendToDiscord('🖥️ **MindServer Backup UI**: http://localhost:8080\nOpen in browser for agent dashboard/viewer (docker-compose up mindcraft).');
                    return;

                default:
                    await message.reply(`Unknown command: \`${cmd}\`. Type \`!help\` for commands.`);
                    return;
            }
        }

        // ── Direct chat with Mindcraft Bot Manager (DM or "bot: <message>" prefix) ──
        const botPrefixMatch = content.match(/^bot:\s*([\s\S]+)/i);
        if (isDM || botPrefixMatch) {
            const question = (botPrefixMatch ? botPrefixMatch[1] : content).trim();
            if (!question) return;
            await message.channel.sendTyping();
            const reply = await handleDirectChat(question);
            const chunks = reply.match(/[\s\S]{1,1990}/g) || [reply];
            for (const chunk of chunks) await message.reply(chunk);
            return;
        }

        // ── Chat relay to agent ──
        if (!mindServerConnected) {
            await message.reply('🔌 MindServer is offline. Type `!reconnect` to retry.');
            return;
        }

        // Validate message
        const validation = validateDiscordMessage(content);
        if (!validation.valid) {
            await message.reply(`⚠️ Invalid message: ${validation.error}`);
            return;
        }
        const cleanContent = validation.sanitized;

        await message.channel.sendTyping();

        // Check for "agentName: message" or "alias: message" prefix
        const parsed = parseAgentPrefix(cleanContent);

        if (parsed) {
            // Targeted: send to one specific agent
            const result = sendToAgent(parsed.agent, parsed.message, message.author.username);
            if (result.sent) {
                await message.reply(`📨 **${result.agent}** received your message. Waiting for response...`);
            } else {
                await message.reply(`⚠️ ${result.reason}`);
            }
        } else {
            // No prefix: broadcast to ALL in-game agents
            const result = sendToAllAgents(cleanContent, message.author.username);
            if (result.sent) {
                await message.reply(`📨 Sent to **${result.agents.join(', ')}**. Waiting for responses...`);
            } else {
                await message.reply(`⚠️ ${result.reason || 'No agents available. Check `!agents` or `!start <name>`.'}`);
            }
        }

    } catch (error) {
        console.error('Message handler error:', error.message);
        try { await message.reply('❌ Something went wrong.'); } catch (_e) { /* ignore */ }
    }
});

client.on('error', (error) => {
    console.error('Discord client error:', error.message);
});

// ── Startup ─────────────────────────────────────────────────
async function start() {
    console.log('🚀 Starting Mindcraft Bot Manager...');
    console.log(`   MindServer: ${MINDSERVER_HOST}:${MINDSERVER_PORT}`);
    if (LOCAL_MINDSERVER_URL) console.log(`   Local MindServer: ${LOCAL_MINDSERVER_URL}`);

    try {
        await client.login(BOT_TOKEN);
    } catch (error) {
        console.error('❌ Discord login failed:', error.message);
        process.exit(1);
    }

    connectToMindServer();
    if (LOCAL_MINDSERVER_URL) {
        connectToLocalMindServer();
    }
    console.log('✅ Mindcraft Bot Manager running');
}

start().catch(err => { console.error('Fatal:', err); process.exit(1); });

// ── Graceful Shutdown ───────────────────────────────────────
const shutdown = async (signal) => {
    console.log(`\n🛑 ${signal} received, shutting down...`);
    if (mindServerSocket) mindServerSocket.disconnect();
    if (localMindServerSocket) localMindServerSocket.disconnect();
    await client.destroy();
    process.exit(0);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
