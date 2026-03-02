/**
 * progress_reporter.js — Periodic Dragon Progression Status Reporter (RC30).
 *
 * Reports bot status every 5 minutes (or on chunk change) to:
 *   1. Console/log output
 *   2. Optional Discord webhook (if DISCORD_PROGRESS_WEBHOOK env var is set)
 *
 * Status includes: current chunk, health/hunger, dimension, location,
 * elapsed time, estimated time to next stage, next goal, and optionally
 * a screenshot if vision is enabled.
 *
 * Uses the same safeWriteFile and logging patterns as dragon_progress.js.
 */

import * as world from './world.js';
import * as skills from './skills.js';

// ── Estimated durations per chunk (minutes), for ETA calculation ────────
const CHUNK_ESTIMATES = {
    diamond_pickaxe: 15,
    nether_portal:   12,
    blaze_rods:      20,
    ender_pearls:    25,
    stronghold:      15,
    dragon_fight:    20,
};

const CHUNK_GOALS = {
    diamond_pickaxe: 'Mine diamonds and craft a diamond pickaxe',
    nether_portal:   'Collect obsidian and build a Nether portal',
    blaze_rods:      'Find a Nether fortress and collect 7+ blaze rods',
    ender_pearls:    'Hunt endermen for 12+ ender pearls, craft eyes of ender',
    stronghold:      'Triangulate and locate the stronghold / End portal',
    dragon_fight:    'Enter the End, destroy crystals, defeat the Ender Dragon',
};

/**
 * ProgressReporter — attaches to a bot + DragonProgress instance.
 * Call start() to begin periodic reporting, stop() to end.
 */
export class ProgressReporter {
    /**
     * @param {object} bot — mineflayer bot instance
     * @param {import('./dragon_progress.js').DragonProgress} progress — dragon state tracker
     * @param {object} [options]
     * @param {number} [options.intervalMs=300000] — report interval (default 5 min)
     * @param {string} [options.webhookUrl] — Discord webhook URL (or set DISCORD_PROGRESS_WEBHOOK env)
     * @param {object} [options.visionInterpreter] — VisionInterpreter instance for screenshots
     */
    constructor(bot, progress, options = {}) {
        this.bot = bot;
        this.progress = progress;
        this.intervalMs = options.intervalMs || 300_000; // 5 minutes
        this.webhookUrl = options.webhookUrl || process.env.DISCORD_PROGRESS_WEBHOOK || null;
        this.visionInterpreter = options.visionInterpreter || null;
        this._timer = null;
        this._startTime = null;
        this._lastChunk = null;
        this._reportCount = 0;
    }

    /** Start the periodic reporter. Safe to call multiple times (idempotent). */
    start() {
        if (this._timer) return; // already running
        this._startTime = Date.now();
        this._lastChunk = this.progress.currentChunk();

        // Immediate first report
        this._report().catch(err => console.error('[ProgressReporter] First report error:', err.message));

        this._timer = setInterval(() => {
            this._report().catch(err => console.error('[ProgressReporter] Report error:', err.message));
        }, this.intervalMs);

        console.log(`[ProgressReporter] Started — reporting every ${Math.round(this.intervalMs / 60_000)}min`);
    }

    /** Stop the reporter. */
    stop() {
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
        }
        // Send final report
        this._report().catch(() => {});
        console.log('[ProgressReporter] Stopped.');
    }

    /**
     * Check if chunk changed and trigger an off-cycle report.
     * Call this from the orchestrator after each chunk transition.
     */
    onChunkChange() {
        const current = this.progress.currentChunk();
        if (current !== this._lastChunk) {
            this._lastChunk = current;
            this._report().catch(err =>
                console.error('[ProgressReporter] Chunk-change report error:', err.message));
        }
    }

    // ── Internal ───────────────────────────────────────────────────────

    async _report() {
        this._reportCount++;
        const status = this._buildStatus();
        const text = this._formatConsole(status);

        // Always log to console
        skills.log(this.bot, `\n${text}`);
        console.log(text);

        // Send to Discord webhook if configured
        if (this.webhookUrl) {
            await this._sendWebhook(status);
        }
    }

    _buildStatus() {
        const bot = this.bot;
        const progress = this.progress;
        const pos = bot.entity?.position;
        const currentChunk = progress.currentChunk();
        const chunkIndex = progress.currentChunkIndex();
        const totalChunks = progress.constructor.CHUNK_ORDER.length;

        // Elapsed time
        const elapsedMs = Date.now() - (this._startTime || Date.now());
        const elapsedMin = Math.round(elapsedMs / 60_000);

        // ETA for current chunk
        const chunkAttempts = currentChunk ? progress.getChunkAttempts(currentChunk) : 0;
        const estimatedMin = currentChunk ? (CHUNK_ESTIMATES[currentChunk] || 15) : 0;
        // Rough ETA: base estimate × (1 + 0.5 * retries) — retries take longer
        const etaMin = Math.round(estimatedMin * (1 + 0.3 * chunkAttempts));

        // Inventory summary
        const inv = world.getInventoryCounts(bot);
        const keyItems = [];
        for (const item of ['diamond_pickaxe', 'diamond_sword', 'iron_sword', 'bow',
            'blaze_rod', 'ender_pearl', 'ender_eye', 'obsidian']) {
            const count = inv[item] || 0;
            if (count > 0) keyItems.push(`${item}×${count}`);
        }

        // Food count
        const foodNames = ['cooked_beef', 'cooked_porkchop', 'cooked_mutton', 'cooked_chicken',
            'bread', 'baked_potato', 'apple', 'carrot', 'golden_apple'];
        let foodCount = 0;
        for (const f of foodNames) foodCount += (inv[f] || 0);

        return {
            botName: bot.username || 'Bot',
            chunk: currentChunk || 'COMPLETE',
            chunkIndex: chunkIndex + 1,
            totalChunks,
            chunkName: currentChunk ? (CHUNK_GOALS[currentChunk] || currentChunk) : 'Dragon defeated!',
            health: bot.health?.toFixed(1) || '?',
            hunger: bot.food ?? '?',
            dimension: bot.game?.dimension || 'unknown',
            position: pos ? `${Math.floor(pos.x)}, ${Math.floor(pos.y)}, ${Math.floor(pos.z)}` : 'unknown',
            elapsedMin,
            etaMin,
            deaths: progress.state.stats.deaths,
            totalRetries: progress.state.stats.totalRetries,
            keyItems,
            foodCount,
            reportNumber: this._reportCount,
        };
    }

    _formatConsole(s) {
        const bar = '═'.repeat(50);
        return [
            `╔${bar}╗`,
            `║  PROGRESS REPORT #${s.reportNumber}`,
            `╠${bar}╣`,
            `║  Bot:       ${s.botName}`,
            `║  Chunk:     ${s.chunkIndex}/${s.totalChunks} — ${s.chunk}`,
            `║  Goal:      ${s.chunkName}`,
            `║  Health:    ${s.health}/20  Hunger: ${s.hunger}/20  Food: ${s.foodCount}`,
            `║  Dimension: ${s.dimension}`,
            `║  Position:  ${s.position}`,
            `║  Elapsed:   ${s.elapsedMin}min  ETA chunk: ~${s.etaMin}min`,
            `║  Deaths:    ${s.deaths}  Retries: ${s.totalRetries}`,
            s.keyItems.length > 0 ? `║  Key items: ${s.keyItems.join(', ')}` : null,
            `╚${bar}╝`,
        ].filter(Boolean).join('\n');
    }

    async _sendWebhook(status) {
        if (!this.webhookUrl) return;
        try {
            const embed = {
                title: `🐉 Progress Report #${status.reportNumber}`,
                color: status.chunk === 'COMPLETE' ? 0x00ff00 : 0x7289da,
                fields: [
                    { name: 'Chunk', value: `${status.chunkIndex}/${status.totalChunks} — ${status.chunk}`, inline: true },
                    { name: 'Goal', value: status.chunkName, inline: false },
                    { name: 'Health', value: `${status.health}/20`, inline: true },
                    { name: 'Hunger', value: `${status.hunger}/20`, inline: true },
                    { name: 'Food', value: `${status.foodCount}`, inline: true },
                    { name: 'Dimension', value: status.dimension, inline: true },
                    { name: 'Position', value: status.position, inline: true },
                    { name: 'Elapsed', value: `${status.elapsedMin}min`, inline: true },
                    { name: 'ETA', value: `~${status.etaMin}min`, inline: true },
                    { name: 'Deaths', value: `${status.deaths}`, inline: true },
                    { name: 'Retries', value: `${status.totalRetries}`, inline: true },
                ],
                timestamp: new Date().toISOString(),
            };

            if (status.keyItems.length > 0) {
                embed.fields.push({ name: 'Key Items', value: status.keyItems.join(', '), inline: false });
            }

            const payload = {
                username: `${status.botName} Progress`,
                embeds: [embed],
            };

            await fetch(this.webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
        } catch (err) {
            console.warn('[ProgressReporter] Webhook send failed:', err.message);
        }
    }
}
