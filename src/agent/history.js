import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { NPCData } from './npc/data.js';
import settings from '../../settings.js';
import { cosineSimilarity } from '../utils/math.js';
import { wordOverlapScore } from '../utils/text.js';

export class History {
    constructor(agent) {
        this.agent = agent;
        this.name = agent.name;
        this.memory_fp = `./bots/${this.name}/memory.json`;
        this.full_history_fp = undefined;
        this.embedding_model = this.agent.prompter.embedding_model;
        this.memory_embeddings = {};

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
    
    turnsToText(turns) {
        if(turns === undefined || turns.length === 0)
            return '';
        let messages = '';
        for (let turn of turns) {
            if (turn.role !== 'assistant')
                messages += turn.content.substring(turn.content.indexOf(':')+1).trim() + '\n';
        }
        return messages.trim();
    }
    // Get formatted memory string for prompts
    async getMemories(messages) {
        if (this.memories.length === 0) return '';
        
        // 获取相关记忆
        const relevantMemories = await this.getRelevant(messages);
        
        // 处理每条记忆
        const formattedMemories = relevantMemories.map((item, index) => {
            // 添加记忆ID
            const memId = String(index + 1).padStart(2, '0');
            
            // 计算时间差异
            const now = new Date();
            const timestamp = new Date(item.message_timeframe.latest);
            const diffMs = now - timestamp;
            
            // 构建时间显示字符串
            const timeDisplay = this.formatTimeDifference(diffMs);
            
            // 返回格式化的记忆字符串
            return `[mem_id:${memId}] [${timeDisplay} ago] ${item.memory}`;
        });
        
        // 合并所有记忆并返回
        return formattedMemories.join('\n');
    }

    // 辅助方法：格式化时间差异
    formatTimeDifference(diffMs) {
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
        
        let timeDisplay = [];
        if (hours > 0) {
            timeDisplay.push(`${hours}${hours === 1 ? 'hr' : 'hrs'}`);
            if (minutes > 0) timeDisplay.push(`${minutes}${minutes === 1 ? 'min' : 'mins'}`);
        } else {
            if (minutes > 0) timeDisplay.push(`${minutes}${minutes === 1 ? 'min' : 'mins'}`);
            timeDisplay.push(`${seconds}${seconds === 1 ? 'sec' : 'secs'}`);
        }
        
        return timeDisplay.join(' ');
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

    // 添加一个新的辅助方法：提取JSON操作
    extractJsonOperations(rawText) {
        // Default values
        let result = {
            memory: rawText,
            operations: null
        };
        
        // Look for code blocks with regex (case insensitive for "json")
        const codeBlockRegex = /```(?:json|JSON)?\n([\s\S]*?)\n```/;
        const match = rawText.match(codeBlockRegex);
        
        if (match && match[1]) {
            try {
                // Parse the JSON content
                const jsonContent = JSON.parse(match[1]);
                
                // Look for newMem operation (case insensitive)
                if (jsonContent.operations) {
                    for (const op of jsonContent.operations) {
                        // Check for newMem operation (case insensitive)
                        if (op.method && op.method.toLowerCase() === "newmem" && 
                            op.params && op.params.memory) {
                            // Use this as our memory content
                            result.memory = op.params.memory;
                            console.log('-------------------------------- extractJsonOperations --------------------------------');
                            console.log('result.memory', result.memory);
                            console.log('-------------------------------- extractJsonOperations --------------------------------');
                            result.operations = jsonContent;
                            break;
                        }
                    }
                }
            } catch (error) {
                console.warn('Error parsing JSON from code block:', error.message);
                // We'll keep the default memory content (original text)
            }
        }
        
        return result;
    }

    async summarizeMemories(turns, triggerType = 'auto') {
        console.log("Storing memories...");
        
        // Get memory summary from the prompter
        let rawResponse = await this.agent.prompter.promptMemSaving(turns);
        
        console.log("===========================");
        console.log(rawResponse);
        console.log("===========================");
        
        // Extract JSON operations using our helper function
        const { memory, operations } = this.extractJsonOperations(rawResponse);
        
        // Truncate if needed
        let finalMemory = memory;
        if (finalMemory.length > 500) {
            finalMemory = finalMemory.slice(0, 500) + '...(Memory truncated to 500 chars)';
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
            memory: finalMemory,
            trigger_type: triggerType,
            message_timeframe: timeframe,
        };
        
        this.memories.push(entry);
        
        // Create embedding for new memory if embedding model is available
        if (this.embedding_model) {
            try {
                // Use memory content as the key instead of timestamp
                this.memory_embeddings[finalMemory] = await this.embedding_model.embed(finalMemory);
            } catch (error) {
                console.warn('Error creating embedding for new memory:', error.message);
            }
        }
        
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

    async load() {
        try {
            if (!existsSync(this.memory_fp)) {
                console.log('No memory file found.');
                return null;
            }
            const data = JSON.parse(readFileSync(this.memory_fp, 'utf8'));
            this.memories = data.memories || [];
            // console.log(`#########Loaded memory \n${JSON.stringify(this.memories, null, 2)}`);
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
            
            // Initialize memory embeddings after loading
            if (this.memories.length > 0) {
                await this.initMemoryEmbeddings();
            }
            
            return data;
        } catch (error) {
            console.error('Failed to load history:', error);
            throw error;
        }
    }

    async initMemoryEmbeddings() {
        if (this.memories.length === 0) {
            console.log('No memories to embed.');
            return;
        }

        if (this.embedding_model) {
            try {
                console.log('Initializing memory embeddings...');
                const embeddingPromises = this.memories.map((memoryItem) => {
                    return (async () => {
                        // Create a content string that captures the essence of the memory
                        const memoryContent = memoryItem.memory;
                        // Use the memory content as the key instead of timestamp
                        this.memory_embeddings[memoryContent] = await this.embedding_model.embed(memoryContent);
                    })();
                });
                await Promise.all(embeddingPromises);
                console.log(`Successfully embedded ${this.memories.length} memories.`);
            } catch (error) {
                console.warn('Error with embedding model during memory initialization, using word-overlap instead:', error.message);
                this.embedding_model = null;
                this.memory_embeddings = {};
            }
        } else {
            console.log('No embedding model available, skipping memory embedding.');
        }
    }

    clear() {
        this.turns = [];
        this.memories = [];
    }

    // Get relevant memories based on semantic similarity
    async getRelevant(turns) {
        if (this.relevant_memory_size === 0)
            return [];
        
        // 创建副本，不管哪种情况都用副本
        const memoriesCopy = [...this.memories];
        
        if(!turns || turns.length === 0) {
            // 按最近时间排序返回记忆
            console.log('// 按最近时间排序返回记忆');
            memoriesCopy.sort((a, b) => new Date(b.message_timeframe.latest) - new Date(a.message_timeframe.latest));
            return memoriesCopy.slice(0, this.relevant_memory_size);
        }
        
        let turn_text = this.turnsToText(turns);
        
        if (this.embedding_model !== null) {
            let embedding = await this.embedding_model.embed(turn_text);
            // 在副本上排序，不修改原始数据
            memoriesCopy.sort((a, b) => 
                cosineSimilarity(embedding, this.memory_embeddings[b.memory]) -
                cosineSimilarity(embedding, this.memory_embeddings[a.memory])
            );
        }
        else {
            // 在副本上排序，不修改原始数据
            memoriesCopy.sort((a, b) => 
                wordOverlapScore(turn_text, b.memory) - wordOverlapScore(turn_text, a.memory)
            );
        }
        console.log('// 按相关性排序返回记忆：', turn_text);
        let selected = memoriesCopy.slice(0, this.relevant_memory_size);
        return JSON.parse(JSON.stringify(selected)); // deep copy
    }
}