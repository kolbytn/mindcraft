import { writeFileSync, readFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Cost per million tokens (USD) — active providers only
const COST_TABLE = {
    // Google Gemini
    'gemini-2.5-pro': { input: 1.25, output: 10.00 },
    'gemini-2.5-flash': { input: 0.15, output: 0.60 },
    'gemini-embedding-001': { input: 0.00, output: 0.00 },
    // xAI Grok
    'grok-4-1-fast-non-reasoning': { input: 0.20, output: 0.50 },
    'grok-4-1-fast': { input: 0.20, output: 0.50 },
    'grok-code-fast-1': { input: 0.20, output: 1.50 },
    'grok-3-mini-latest': { input: 0.30, output: 0.50 },
    'grok-2-vision-1212': { input: 2.00, output: 10.00 },
    // Ollama (local) — free
    '_ollama_default': { input: 0.00, output: 0.00 },
    // vLLM (local) — free
    '_vllm_default': { input: 0.00, output: 0.00 },
};

function getCostPerMillion(modelName) {
    if (!modelName) return null;
    if (COST_TABLE[modelName]) return COST_TABLE[modelName];
    for (const [key, val] of Object.entries(COST_TABLE)) {
        if (key.startsWith('_') ) continue; // skip local defaults
        if (modelName.startsWith(key)) return val;
    }
    return null;
}

export class UsageTracker {
    constructor(agentName) {
        this.agentName = agentName;
        this.filePath = path.join(__dirname, `../../bots/${agentName}/usage.json`);
        this.data = this._defaultData();
        this._dirty = false;
        this._saveInterval = null;
        this._recentCalls = []; // rolling window for RPM/TPM
    }

    _defaultData() {
        return {
            agent: this.agentName,
            session_start: new Date().toISOString(),
            models: {},
            totals: {
                calls: 0,
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0,
                estimated_cost_usd: 0,
            },
        };
    }

    load() {
        try {
            const raw = readFileSync(this.filePath, 'utf8');
            this.data = JSON.parse(raw);
        } catch (_err) {
            this.data = this._defaultData();
        }
        // Clear any existing interval to prevent double-timer leak
        if (this._saveInterval) clearInterval(this._saveInterval);
        this._saveInterval = setInterval(() => {
            if (this._dirty) this.saveSync();
        }, 30_000);
    }

    saveSync() {
        try {
            const dir = path.dirname(this.filePath);
            mkdirSync(dir, { recursive: true });
            writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
            this._dirty = false;
        } catch (err) {
            console.error(`[UsageTracker] Save failed for ${this.agentName}:`, err.message);
        }
    }

    record(modelName, provider, callType, usage) {
        const key = modelName || `${provider}/unknown`;
        if (!this.data.models[key]) {
            this.data.models[key] = {
                provider: provider,
                calls: 0,
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0,
                estimated_cost_usd: 0,
                by_type: {},
            };
        }
        const m = this.data.models[key];
        m.calls++;

        const pt = usage?.prompt_tokens || 0;
        const ct = usage?.completion_tokens || 0;
        const tt = usage?.total_tokens || pt + ct;

        m.prompt_tokens += pt;
        m.completion_tokens += ct;
        m.total_tokens += tt;

        if (!m.by_type[callType]) {
            m.by_type[callType] = { calls: 0, prompt_tokens: 0, completion_tokens: 0 };
        }
        m.by_type[callType].calls++;
        m.by_type[callType].prompt_tokens += pt;
        m.by_type[callType].completion_tokens += ct;

        const isLocal = provider === 'ollama' || provider === 'vllm';
        const costInfo = isLocal ? COST_TABLE._vllm_default : getCostPerMillion(modelName);
        if (costInfo) {
            const callCost = (pt * costInfo.input + ct * costInfo.output) / 1_000_000;
            m.estimated_cost_usd += callCost;
            this.data.totals.estimated_cost_usd += callCost;
        }

        this.data.totals.calls++;
        this.data.totals.prompt_tokens += pt;
        this.data.totals.completion_tokens += ct;
        this.data.totals.total_tokens += tt;
        this.data.last_call = new Date().toISOString();
        this._dirty = true;

        // Rolling window for RPM/TPM (cap at 1000 entries to prevent unbounded growth)
        this._recentCalls.push({ timestamp: Date.now(), tokens: tt });
        if (this._recentCalls.length > 1000) {
            this._cleanRollingWindow();
        }
    }

    _cleanRollingWindow() {
        const cutoff = Date.now() - 60_000;
        this._recentCalls = this._recentCalls.filter(c => c.timestamp > cutoff);
    }

    _getRPM() {
        this._cleanRollingWindow();
        return this._recentCalls.length;
    }

    _getTPM() {
        this._cleanRollingWindow();
        return this._recentCalls.reduce((sum, c) => sum + c.tokens, 0);
    }

    getSnapshot() {
        return { ...this.data, rpm: this._getRPM(), tpm: this._getTPM() };
    }

    destroy() {
        if (this._saveInterval) clearInterval(this._saveInterval);
        if (this._dirty) this.saveSync();
    }
}
