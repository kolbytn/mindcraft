import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { NPCData } from './npc/data.js';
import settings from '../../settings.js';


export class History {
    constructor(agent) {
        this.agent = agent;
        this.name = agent.name;
        this.memory_fp = `./bots/${this.name}/memory.json`;
        this.full_history_fp = undefined;

        mkdirSync(`./bots/${this.name}/histories`, { recursive: true });

        this.turns = [];

        // Natural language memory as a list of timestamped summaries
        this.memories = [];

        // Maximum number of messages to keep in context before saving chunk to memory
        this.max_messages = settings.max_messages;

        // Number of messages to remove from current history and save into memory
        this.summary_chunk_size = settings.summary_chunk_size; 
        // chunking reduces expensive calls to promptMemSaving and appendFullHistory
        // and improves the quality of the memory summary
        this.relevant_memory_size = settings.relevant_memory_size;
    }

    getHistory() { // expects an Examples object
        return JSON.parse(JSON.stringify(this.turns));
    }

    // Get formatted memory string for prompts
    getMemories() {
        if (this.memories.length === 0) return '';
        
        // Sort by creation date descending (newest first)
        const relevantMemories = [...this.memories]
            .sort((a, b) => {
                return new Date(b.created_at) - new Date(a.created_at);
            })
            .slice(0, this.relevant_memory_size);
        
        return relevantMemories.map(item => {
            // Get timestamps from memory entry
            const earliest = item.message_timeframe?.earliest || item.created_at || '';
            const latest = item.message_timeframe?.latest || item.created_at || '';
            
            // Extract date parts using regex (MM-DD HH:MM:SS)
            const earliestMatch = earliest.match(/\d+-(\d+-\d+)\s+(\d+:\d+:\d+)/);
            const latestMatch = latest.match(/\d+-(\d+-\d+)\s+(\d+:\d+:\d+)/);
            
            if (!earliestMatch) return `[${earliest}] ${item.memory}`;
            
            const earliestDate = earliestMatch[1];
            const earliestTime = earliestMatch[2];
            const latestDate = latestMatch ? latestMatch[1] : '';
            const latestTime = latestMatch ? latestMatch[2] : '';
            
            // Create display string based on comparison
            let timeDisplay = `${earliestDate} ${earliestTime}`;
            
            if (latest && earliest !== latest) {
                timeDisplay = earliestDate === latestDate
                    ? `${earliestDate} ${earliestTime}~${latestTime}`
                    : `${earliestDate} ${earliestTime}~${latestDate} ${latestTime}`;
            }
            
            return `[${timeDisplay}] ${item.memory}`;
        }).join('\n');
    }

    // Get current formatted timestamp
    getFormattedTimestamp() {
        const now = new Date();
        return now.getFullYear() + '-' + 
               String(now.getMonth() + 1).padStart(2, '0') + '-' + 
               String(now.getDate()).padStart(2, '0') + ' ' + 
               String(now.getHours()).padStart(2, '0') + ':' + 
               String(now.getMinutes()).padStart(2, '0') + ':' + 
               String(now.getSeconds()).padStart(2, '0');
    }

    async summarizeMemories(turns, triggerType = 'auto') {
        console.log("Storing memories...");
        
        // Get memory summary and truncate if needed
        let memory = await this.agent.prompter.promptMemSaving(turns);
        if (memory.length > 500) {
            memory = memory.slice(0, 500) + '...(Memory truncated to 500 chars)';
        }

        // Get timestamps
        const timestamp = this.getFormattedTimestamp();
        
        // Extract time range from turns (if available)
        const timeframe = turns.length > 0 
            ? (() => {
                const sorted = [...turns].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
                return {
                    earliest: sorted[0].created_at || timestamp,
                    latest: sorted[sorted.length - 1].created_at || timestamp
                };
              })()
            : { earliest: timestamp, latest: timestamp };

        // Create and store memory entry
        const entry = {
            created_at: timestamp,
            memory,
            trigger_type: triggerType,
            message_timeframe: timeframe
        };
        
        this.memories.push(entry);
        console.log(`Memory added: ${timestamp}, type: ${triggerType}`);
        return entry;
    }

    async appendFullHistory(to_store) {
        if (this.full_history_fp === undefined) {
            const string_timestamp = new Date().toLocaleString().replace(/[/:]/g, '-').replace(/ /g, '').replace(/,/g, '_');
            this.full_history_fp = `./bots/${this.name}/histories/${string_timestamp}.json`;
            writeFileSync(this.full_history_fp, '[]', 'utf8');
        }
        try {
            const data = readFileSync(this.full_history_fp, 'utf8');
            let full_history = JSON.parse(data);
            full_history.push(...to_store);
            writeFileSync(this.full_history_fp, JSON.stringify(full_history, null, 4), 'utf8');
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
        
        // Add timestamp to the message
        const timestamp = this.getFormattedTimestamp();
        this.turns.push({
            role, 
            content,
            created_at: timestamp
        });

        if (this.turns.length >= this.max_messages) {
            let chunk = this.turns.splice(0, this.summary_chunk_size);
            while (this.turns.length > 0 && this.turns[0].role === 'assistant')
                chunk.push(this.turns.shift()); // remove until turns starts with system/user message

            await this.summarizeMemories(chunk, 'auto');
            await this.appendFullHistory(chunk);
        }
    }

    async save() {
        try {
            const data = {
                memories: this.memories,
                turns: this.turns,
                self_prompting_state: this.agent.self_prompter.state,
                self_prompt: this.agent.self_prompter.isStopped() ? null : this.agent.self_prompter.prompt,
                last_sender: this.agent.last_sender
            };
            writeFileSync(this.memory_fp, JSON.stringify(data, null, 2));
            console.log('Saved memories to:', this.memory_fp);
        } catch (error) {
            console.error('Failed to save history:', error);
            throw error;
        }
    }

    load() {
        try {
            if (!existsSync(this.memory_fp)) {
                console.log('No memory file found.');
                return null;
            }
            const data = JSON.parse(readFileSync(this.memory_fp, 'utf8'));
            
            // Handle both old and new memory format
            if (data.memory && typeof data.memory === 'string') {
                // Convert old format to new format with readable timestamp
                const formattedDate = this.getFormattedTimestamp();
                
                this.memories = [{
                    created_at: formattedDate,
                    memory: data.memory,
                    trigger_type: 'auto',
                    message_timeframe: {
                        earliest: formattedDate,
                        latest: formattedDate
                    }
                }];
                console.log('Converted old memory format to new timestamped format');
            } else {
                // Process existing memories
                this.memories = data.memories || [];
                
                // Convert any numeric timestamps, rename timestamp to created_at, or add missing fields
                this.memories = this.memories.map(item => {
                    let updatedItem = { ...item };
                    
                    // Rename timestamp to created_at if it exists
                    if (item.timestamp !== undefined) {
                        updatedItem.created_at = item.timestamp;
                        delete updatedItem.timestamp;
                    }
                    
                    // Convert numeric created_at (or old timestamp)
                    if (typeof updatedItem.created_at === 'number') {
                        const date = new Date(updatedItem.created_at);
                        updatedItem.created_at = date.getFullYear() + '-' + 
                                             String(date.getMonth() + 1).padStart(2, '0') + '-' + 
                                             String(date.getDate()).padStart(2, '0') + ' ' + 
                                             String(date.getHours()).padStart(2, '0') + ':' + 
                                             String(date.getMinutes()).padStart(2, '0') + ':' + 
                                             String(date.getSeconds()).padStart(2, '0');
                    }
                    
                    // Add trigger_type if missing
                    if (!updatedItem.trigger_type) {
                        updatedItem.trigger_type = 'auto';
                    }
                    
                    // Add message_timeframe if missing
                    if (!updatedItem.message_timeframe) {
                        updatedItem.message_timeframe = {
                            earliest: updatedItem.created_at,
                            latest: updatedItem.created_at
                        };
                    }
                    
                    return updatedItem;
                });
            }
            
            // Process turns
            this.turns = data.turns || [];
            
            // Add created_at to turns if missing
            this.turns = this.turns.map(turn => {
                if (!turn.created_at) {
                    return {
                        ...turn,
                        created_at: this.getFormattedTimestamp()
                    };
                }
                return turn;
            });
            
            console.log('Loaded memories:', this.memories.length);
            return data;
        } catch (error) {
            console.error('Failed to load history:', error);
            throw error;
        }
    }

    clear() {
        this.turns = [];
        this.memories = [];
    }
}