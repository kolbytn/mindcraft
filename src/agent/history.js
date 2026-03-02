import { readFileSync, mkdirSync, existsSync, writeFile, renameSync, unlinkSync } from 'fs';
import { promisify } from 'util';

import settings from './settings.js';

const writeFileAsync = promisify(writeFile);

// RC27: Atomic write — write to .tmp file then rename, preventing corruption on crash
async function safeWriteFile(filepath, content, retries = 3, delay = 100) {
    const tmpPath = filepath + '.tmp';
    for (let i = 0; i < retries; i++) {
        try {
            await writeFileAsync(tmpPath, content, 'utf8');
            // Atomic rename (overwrites destination on most OSes)
            try { renameSync(tmpPath, filepath); } catch (renameErr) {
                // Windows may fail rename if destination is locked; fall back to direct write
                console.warn(`[RC27] Atomic rename failed for ${filepath}, falling back to direct write:`, renameErr.message);
                await writeFileAsync(filepath, content, 'utf8');
                try { unlinkSync(tmpPath); } catch(_e) {}
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


export class History {
    constructor(agent) {
        this.agent = agent;
        this.name = agent.name;
        this.memory_fp = `./bots/${this.name}/memory.json`;
        this.full_history_fp = undefined;

        mkdirSync(`./bots/${this.name}/histories`, { recursive: true });

        this.turns = [];

        // Natural language memory as a summary of recent messages + previous memory
        this.memory = '';

        // Maximum number of messages to keep in context before saving chunk to memory
        this.max_messages = settings.max_messages;

        // Number of messages to remove from current history and save into memory
        this.summary_chunk_size = 5; 
        // chunking reduces expensive calls to promptMemSaving and appendFullHistory
        // and improves the quality of the memory summary
    }

    getHistory() { // expects an Examples object
        return JSON.parse(JSON.stringify(this.turns));
    }

    async summarizeMemories(turns) {
        console.log("Storing memories...");
        this.memory = await this.agent.prompter.promptMemSaving(turns);

        // ── Memory sanitization: strip false "broken" beliefs ──────────
        // These are residual beliefs from past bugs that are no longer true.
        // The gathering system works correctly — the bots just need to move.
        const toxicPatterns = [
            /\b(?:block |my )?gathering(?:\/\w+)? (?:is |remains? |still )?(?:broken|non-?functional|not work(?:ing)?|fails?|bugged)\b[^.;]*/gi,
            /\bcollect(?:Blocks?|ion)? (?:is |command )?(?:broken|non-?functional|not work(?:ing)?|fails?|bugged)\b/gi,
            /\b(?:waiting|await(?:ing)?) (?:for )?(?:the |an )?(?:update|fix|patch)\b[^.;]*/gi,
            /\bneed(?:s)? (?:an? )?(?:fix|update|patch) (?:for|to (?:fix|repair)) (?:\w+ )*(?:gathering|collect(?:ion|Blocks?)|core mechanics)\b/gi,
            /\bcannot gather (?:any )?resources\b/gi,
            /\bgathering(?:\/\w+)? (?:commands? )?(?:are |is )?(?:still )?(?:broken|non-?functional) for both\b[^.;]*/gi,
            /\bcore (?:mechanics|systems?) (?:are |is )?(?:broken|non-?functional|bugged)\b[^.;]*/gi,
            /\bcrafted items don'?t persist\b/gi,
            /CRITICAL:[^.;]*(?:non-?functional|broken|bugged)[^.;]*/gi,
        ];
        for (const pattern of toxicPatterns) {
            this.memory = this.memory.replace(pattern, 'gathering works — relocate to find blocks');
        }
        // ──────────────────────────────────────────────────────────────────

        if (this.memory.length > 800) {
            this.memory = this.memory.slice(0, 800);
            this.memory += '...(Memory truncated to 800 chars. Compress it more next time)';
        }

        console.log("Memory updated to: ", this.memory);
    }

    async appendFullHistory(to_store) {
        if (this.full_history_fp === undefined) {
            const string_timestamp = new Date().toLocaleString().replace(/[/:]/g, '-').replace(/ /g, '').replace(/,/g, '_');
            this.full_history_fp = `./bots/${this.name}/histories/${string_timestamp}.json`;
            await safeWriteFile(this.full_history_fp, '[]');
        }
        try {
            const data = readFileSync(this.full_history_fp, 'utf8');
            let full_history = JSON.parse(data);
            full_history.push(...to_store);
            await safeWriteFile(this.full_history_fp, JSON.stringify(full_history, null, 4));
        } catch (err) {
            console.error(`Error reading ${this.name}'s full history file: ${err.message}`);
        }
    }

    async add(name, content) {
        let role = 'assistant';
        if (name === 'system') {
            role = 'system';
        }
        else if (name !== this.name) {
            role = 'user';
            content = `${name}: ${content}`;
        }
        this.turns.push({role, content});

        if (this.turns.length >= this.max_messages) {
            let chunk = this.turns.splice(0, this.summary_chunk_size);
            while (this.turns.length > 0 && this.turns[0].role === 'assistant')
                chunk.push(this.turns.shift()); // remove until turns starts with system/user message

            await this.summarizeMemories(chunk);
            await this.appendFullHistory(chunk);
        }
    }

    async save() {
        try {
            const data = {
                memory: this.memory,
                turns: this.turns,
                self_prompting_state: this.agent.self_prompter.state,
                self_prompt: this.agent.self_prompter.isStopped() ? null : this.agent.self_prompter.prompt,
                taskStart: this.agent.task.taskStartTime,
                last_sender: this.agent.last_sender
            };
            await safeWriteFile(this.memory_fp, JSON.stringify(data, null, 2));
            console.log('Saved memory to:', this.memory_fp);
            if (this.agent.learnings?._dirty) await this.agent.learnings.save();
        } catch (error) {
            console.error('Failed to save history:', error);
        }
    }

    load() {
        try {
            if (!existsSync(this.memory_fp)) {
                console.log('No memory file found.');
                return null;
            }
            const raw = readFileSync(this.memory_fp, 'utf8');
            // RC27: Guard against corrupted/empty memory files
            if (!raw || !raw.trim()) {
                console.warn(`[RC27] Memory file ${this.memory_fp} is empty, starting fresh.`);
                return null;
            }
            let data;
            try {
                data = JSON.parse(raw);
            } catch (parseErr) {
                console.error(`[RC27] Corrupted memory file ${this.memory_fp}: ${parseErr.message}. Starting fresh.`);
                // Rename corrupted file so it's not lost but won't block startup
                const backupPath = this.memory_fp + '.corrupted.' + Date.now();
                try { renameSync(this.memory_fp, backupPath); } catch(_e) {}
                return null;
            }
            this.memory = data.memory || '';

            // ── Sanitize stale false beliefs on load ──────────────────────
            const toxicPatterns = [
                /\b(?:block |my )?gathering(?:\/\w+)? (?:is |remains? |still )?(?:broken|non-?functional|not work(?:ing)?|fails?|bugged)\b[^.;]*/gi,
                /\bcollect(?:Blocks?|ion)? (?:is |command )?(?:broken|non-?functional|not work(?:ing)?|fails?|bugged)\b/gi,
                /\b(?:waiting|await(?:ing)?) (?:for )?(?:the |an )?(?:update|fix|patch)\b[^.;]*/gi,
                /\bneed(?:s)? (?:an? )?(?:fix|update|patch) (?:for|to (?:fix|repair)) (?:\w+ )*(?:gathering|collect(?:ion|Blocks?)|core mechanics)\b/gi,
                /\bcannot gather (?:any )?resources\b/gi,
                /\bgathering(?:\/\w+)? (?:commands? )?(?:are |is )?(?:still )?(?:broken|non-?functional) for both\b[^.;]*/gi,
                /\bcore (?:mechanics|systems?) (?:are |is )?(?:broken|non-?functional|bugged)\b[^.;]*/gi,
                /\bcrafted items don'?t persist\b/gi,
                /CRITICAL:[^.;]*(?:non-?functional|broken|bugged)[^.;]*/gi,
            ];
            const origLen = this.memory.length;
            for (const pattern of toxicPatterns) {
                this.memory = this.memory.replace(pattern, 'gathering works — relocate to find blocks');
            }
            if (this.memory.length !== origLen) {
                console.log('[Memory] Sanitized stale false beliefs from loaded memory');
            }
            // ──────────────────────────────────────────────────────────────

            this.turns = data.turns || [];
            console.log('Loaded memory:', this.memory);
            return data;
        } catch (error) {
            console.error('Failed to load history:', error);
            // RC27: Don't re-throw — return null to start fresh instead of crash-looping
            return null;
        }
    }

    clear() {
        this.turns = [];
        this.memory = '';
    }
}