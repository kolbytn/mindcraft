/**
 * dragon_progress.js — Persistent Dragon Progression State
 *
 * Survives restarts, deaths, and crashes via atomic JSON writes.
 * Tracks: completed chunks, key coordinates, inventory milestones,
 * death count, current dimension, retry counts, and timestamps.
 *
 * Uses the same safeWriteFile pattern as history.js (RC27).
 */

import { readFileSync, mkdirSync, existsSync, renameSync, unlinkSync } from 'fs';
import { writeFile } from 'fs/promises';

// ── RC27: Atomic write — .tmp + rename ─────────────────────────────────
async function safeWriteFile(filepath, content, retries = 3, delay = 100) {
    const tmpPath = filepath + '.tmp';
    for (let i = 0; i < retries; i++) {
        try {
            await writeFile(tmpPath, content, 'utf8');
            try {
                renameSync(tmpPath, filepath);
            } catch (renameErr) {
                console.warn(`[DragonProgress] Atomic rename failed for ${filepath}, falling back:`, renameErr.message);
                await writeFile(filepath, content, 'utf8');
                try { unlinkSync(tmpPath); } catch (_e) { /* ignore */ }
            }
            return;
        } catch (error) {
            if (error.code === 'EBADF' && i < retries - 1) {
                await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
                continue;
            }
            throw error;
        }
    }
}

// ── Chunk definitions ──────────────────────────────────────────────────
export const CHUNKS = Object.freeze({
    DIAMOND_PICKAXE:   'diamond_pickaxe',
    NETHER_PORTAL:     'nether_portal',
    BLAZE_RODS:        'blaze_rods',
    ENDER_PEARLS:      'ender_pearls',
    STRONGHOLD:        'stronghold',
    DRAGON_FIGHT:      'dragon_fight',
});

const CHUNK_ORDER = [
    CHUNKS.DIAMOND_PICKAXE,
    CHUNKS.NETHER_PORTAL,
    CHUNKS.BLAZE_RODS,
    CHUNKS.ENDER_PEARLS,
    CHUNKS.STRONGHOLD,
    CHUNKS.DRAGON_FIGHT,
];

function defaultState() {
    return {
        version: 2,
        startedAt: new Date().toISOString(),
        lastUpdated: null,

        // Which chunks are done / in-progress / failed
        chunks: Object.fromEntries(CHUNK_ORDER.map(c => [c, {
            status: 'pending',       // pending | active | done | failed
            attempts: 0,
            lastAttempt: null,
            completedAt: null,
        }])),

        // Key coordinates discovered during the run
        coords: {
            overworldPortal: null,    // [x, y, z]
            netherPortal: null,
            netherFortress: null,
            stronghold: null,
            endPortal: null,
            lastDeathPos: null,
            basecamp: null,           // safe surface base
        },

        // Inventory milestones — tracks highest counts ever achieved
        milestones: {
            hasDiamondPick: false,
            hasIronArmor: false,
            hasDiamondSword: false,
            hasBow: false,
            blazeRods: 0,
            enderPearls: 0,
            eyesOfEnder: 0,
        },

        // Run statistics
        stats: {
            deaths: 0,
            totalRetries: 0,
            currentChunkIndex: 0,     // index into CHUNK_ORDER
            dimension: 'overworld',   // overworld | the_nether | the_end
        },

        // Dragon fight specific
        dragonFight: {
            crystalsDestroyed: 0,
            dragonHitsLanded: 0,
            enteredEnd: false,
        },
    };
}

export class DragonProgress {
    /**
     * @param {string} botName — used to derive file path under bots/
     */
    constructor(botName) {
        this.botName = botName;
        this.filePath = `./bots/${botName}/dragon_progress.json`;
        this.state = defaultState();
        this._dirty = false;
    }

    // ── Persistence ────────────────────────────────────────────────────

    load() {
        try {
            if (!existsSync(this.filePath)) {
                console.log(`[DragonProgress] No save file for ${this.botName}, starting fresh.`);
                return this.state;
            }
            const raw = readFileSync(this.filePath, 'utf8');
            if (!raw || !raw.trim()) {
                console.warn(`[DragonProgress] Empty save file, starting fresh.`);
                return this.state;
            }
            const loaded = JSON.parse(raw);
            // Merge with defaults to handle schema upgrades
            this.state = { ...defaultState(), ...loaded };
            // Ensure all chunks exist (in case new ones were added)
            for (const c of CHUNK_ORDER) {
                if (!this.state.chunks[c]) {
                    this.state.chunks[c] = { status: 'pending', attempts: 0, lastAttempt: null, completedAt: null };
                }
            }
            console.log(`[DragonProgress] Loaded state for ${this.botName}: chunk ${this.currentChunkIndex()}/${CHUNK_ORDER.length}`);
            return this.state;
        } catch (err) {
            console.error(`[DragonProgress] Failed to load for ${this.botName}:`, err.message);
            // Rename corrupted file
            if (existsSync(this.filePath)) {
                const backup = this.filePath + '.corrupted.' + Date.now();
                try { renameSync(this.filePath, backup); } catch (_e) { /* ignore */ }
            }
            return this.state;
        }
    }

    async save() {
        try {
            const dir = `./bots/${this.botName}`;
            mkdirSync(dir, { recursive: true });
            this.state.lastUpdated = new Date().toISOString();
            await safeWriteFile(this.filePath, JSON.stringify(this.state, null, 2));
            this._dirty = false;
        } catch (err) {
            console.error(`[DragonProgress] Failed to save:`, err.message);
        }
    }

    // ── Chunk State ────────────────────────────────────────────────────

    /** Get the current chunk name (the first non-done chunk) */
    currentChunk() {
        for (const c of CHUNK_ORDER) {
            if (this.state.chunks[c].status !== 'done') return c;
        }
        return null; // all done!
    }

    /** Get the 0-based index of current chunk */
    currentChunkIndex() {
        const current = this.currentChunk();
        return current ? CHUNK_ORDER.indexOf(current) : CHUNK_ORDER.length;
    }

    /** Is a specific chunk complete? */
    isChunkDone(chunkName) {
        return this.state.chunks[chunkName]?.status === 'done';
    }

    /** Mark a chunk as started */
    markChunkActive(chunkName) {
        const chunk = this.state.chunks[chunkName];
        if (!chunk) return;
        chunk.status = 'active';
        chunk.attempts++;
        chunk.lastAttempt = new Date().toISOString();
        this.state.stats.totalRetries++;
        this.state.stats.currentChunkIndex = CHUNK_ORDER.indexOf(chunkName);
        this._dirty = true;
    }

    /** Mark a chunk as successfully completed */
    markChunkDone(chunkName) {
        const chunk = this.state.chunks[chunkName];
        if (!chunk) return;
        chunk.status = 'done';
        chunk.completedAt = new Date().toISOString();
        this._dirty = true;
    }

    /** Mark a chunk as failed (for this attempt) */
    markChunkFailed(chunkName) {
        const chunk = this.state.chunks[chunkName];
        if (!chunk) return;
        chunk.status = 'failed';
        this._dirty = true;
    }

    /** Get how many attempts a chunk has had */
    getChunkAttempts(chunkName) {
        return this.state.chunks[chunkName]?.attempts || 0;
    }

    /** Is everything complete? */
    isComplete() {
        return CHUNK_ORDER.every(c => this.state.chunks[c].status === 'done');
    }

    /** Reset a specific chunk back to pending (for retry after recovery) */
    resetChunk(chunkName) {
        const chunk = this.state.chunks[chunkName];
        if (!chunk) return;
        chunk.status = 'pending';
        this._dirty = true;
    }

    // ── Coordinates ────────────────────────────────────────────────────

    setCoord(name, x, y, z) {
        if (this.state.coords[name] !== undefined) {
            this.state.coords[name] = [Math.floor(x), Math.floor(y), Math.floor(z)];
            this._dirty = true;
        }
    }

    getCoord(name) {
        return this.state.coords[name];
    }

    // ── Milestones ─────────────────────────────────────────────────────

    updateMilestones(bot) {
        const inv = {};
        if (bot.inventory) {
            for (const item of bot.inventory.items()) {
                inv[item.name] = (inv[item.name] || 0) + item.count;
            }
        }
        const m = this.state.milestones;
        m.hasDiamondPick = m.hasDiamondPick || !!(inv['diamond_pickaxe']);
        m.hasIronArmor = m.hasIronArmor || !!(inv['iron_chestplate']);
        m.hasDiamondSword = m.hasDiamondSword || !!(inv['diamond_sword']);
        m.hasBow = m.hasBow || !!(inv['bow']);
        m.blazeRods = Math.max(m.blazeRods, inv['blaze_rod'] || 0);
        m.enderPearls = Math.max(m.enderPearls, inv['ender_pearl'] || 0);
        m.eyesOfEnder = Math.max(m.eyesOfEnder, inv['ender_eye'] || 0);
        this._dirty = true;
    }

    // ── Death tracking ─────────────────────────────────────────────────

    recordDeath(x, y, z, dimension) {
        this.state.stats.deaths++;
        this.state.coords.lastDeathPos = [Math.floor(x), Math.floor(y), Math.floor(z)];
        this.state.stats.dimension = dimension || 'overworld';
        this._dirty = true;
    }

    // ── Dimension ──────────────────────────────────────────────────────

    setDimension(dim) {
        this.state.stats.dimension = dim;
        this._dirty = true;
    }

    getDimension() {
        return this.state.stats.dimension;
    }

    // ── Dragon fight state ─────────────────────────────────────────────

    recordCrystalDestroyed() {
        this.state.dragonFight.crystalsDestroyed++;
        this._dirty = true;
    }

    recordDragonHit() {
        this.state.dragonFight.dragonHitsLanded++;
        this._dirty = true;
    }

    setEnteredEnd(val = true) {
        this.state.dragonFight.enteredEnd = val;
        this._dirty = true;
    }

    // ── Summary for LLM prompt injection ───────────────────────────────

    getSummary() {
        const s = this.state;
        const idx = this.currentChunkIndex();
        const current = this.currentChunk();
        const parts = [];

        parts.push(`[DRAGON PROGRESS ${idx}/${CHUNK_ORDER.length}]`);

        // Completed chunks
        const done = CHUNK_ORDER.filter(c => s.chunks[c].status === 'done');
        if (done.length > 0) {
            parts.push(`Done: ${done.join(', ')}`);
        }

        // Current chunk + attempts
        if (current) {
            const attempts = s.chunks[current].attempts;
            parts.push(`Current: ${current} (attempt ${attempts + 1})`);
        } else {
            parts.push('ALL CHUNKS COMPLETE — dragon defeated!');
        }

        // Key coords
        const coordEntries = Object.entries(s.coords)
            .filter(([, v]) => v !== null)
            .map(([k, v]) => `${k}: ${v.join(',')}`);
        if (coordEntries.length > 0) {
            parts.push(`Coords: ${coordEntries.join(' | ')}`);
        }

        // Stats
        parts.push(`Deaths: ${s.stats.deaths} | Dim: ${s.stats.dimension}`);

        // Dragon fight
        if (s.dragonFight.enteredEnd) {
            parts.push(`End fight: ${s.dragonFight.crystalsDestroyed} crystals, ${s.dragonFight.dragonHitsLanded} hits`);
        }

        return parts.join('\n');
    }

    // ── Static helpers ─────────────────────────────────────────────────

    static get CHUNK_ORDER() {
        return CHUNK_ORDER;
    }

    static get CHUNKS() {
        return CHUNKS;
    }
}
