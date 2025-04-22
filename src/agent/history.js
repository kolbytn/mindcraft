import { writeFileSync, readFileSync, mkdirSync, existsSync, appendFileSync } from 'fs';
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
        
        // 创建表格头部，添加类型列
        const tableHeader = '| Memory ID | Type | Time(ago) | Content |\n| --- | --- | --- | --- |';
        
        // 处理每条记忆
        const formattedMemories = relevantMemories.map((item) => {
            const memId = item.id;
            const memoryType = item.memory_type || 'event'; // 默认为事件类型
            
            // 计算时间差异，仅对event类型显示时间
            let timeDisplay = '';
            if (typeof memoryType === 'string' && memoryType.toLowerCase() === 'event') {
                const now = new Date();
                const timestamp = new Date(item.message_timeframe.latest);
                const diffMs = now - timestamp;
                timeDisplay = this.formatTimeDifference(diffMs);
            } else {
                // 对knowledge类型，不显示时间
                timeDisplay = '-';
            }
            
            // 返回格式化的表格行
            const safeMemory = item.memory.replace(/\|/g, '\\|');
            return `| ${memId} | ${memoryType} | ${timeDisplay} | ${safeMemory} |`;
        });
        
        // 合并表格头部和内容并返回
        return tableHeader + '\n' + formattedMemories.join('\n');
    }

    // 辅助方法：格式化时间差异，简化版本
    formatTimeDifference(diffMs) {
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
        
        if (hours > 0) {
            return `${hours}h${minutes}m`;
        } else if (minutes > 0) {
            return `${minutes}m`;
        } else {
            return `${seconds}s`;
        }
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
                 // 记录原始LLM响应
                this.logOperation('raw_llm_response', jsonContent);
                // Look for newMem operation (case insensitive)
                if (jsonContent.operations) {
                    for (const op of jsonContent.operations) {
                        // Check for newMem operation (case insensitive)
                        if (op.method && op.method.toLowerCase() === "newmem" && 
                            op.params && op.params.memory) {
                            // Use this as our memory content
                            result.memory = op.params.memory;
                            console.log('++++++++++++++++++++++++++[src/agent/history.js] extractJsonOperations +++++++++++++++++++++++++++++++++++++++++');
                            console.log("[src/agent/history.js] extractJsonOperations: \n", result.memory);
                            console.log('^^^^^^^^^^^^^^^^^^^^^^^^^^[src/agent/history.js] extractJsonOperations ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^');
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

    // 添加新的辅助方法：生成6位Base36编码的ID
    generateMemoryId(timestamp) {
        // 将ISO时间字符串转换为Unix时间戳（秒）
        const unixTime = Math.floor(new Date(timestamp).getTime() / 1000);
        
        // 转换为Base36并取后6位
        const base36 = unixTime.toString(36);
        const id = base36.slice(-6).padStart(6, '0');
        
        return id;
    }

    async summarizeMemories(turns, triggerType = 'auto') {
        console.log("Storing memories...");
        
        // Get memory summary from the prompter
        let rawResponse = await this.agent.prompter.promptMemSaving(turns);
        
        console.log('++++++++++++++++++++++++++[src/agent/history.js] summarizeMemories +++++++++++++++++++++++++++++++++++++++++');
        console.log("[src/agent/history.js] rawResponse: \n", rawResponse);
        console.log('^^^^^^^^^^^^^^^^^^^^^^^^^^[src/agent/history.js] summarizeMemories ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^');       
        
        // Extract JSON operations using our helper function
        const { operations } = this.extractJsonOperations(rawResponse);
        
        if (!operations || !operations.operations) {
            console.warn("No valid operations found in AI response");
            return null;
        }

        // 执行所有操作
        const results = [];
        for (const operation of operations.operations) {
            const result = await this.executeMemoryOperation(operation);
            if (result) {
                results.push(result);
            }
        }

        return results;
    }

    async appendFullHistory(to_store) {
        if (this.full_history_fp === undefined) {
            const string_timestamp = new Date().toLocaleString().replace(/[/:]/g, '-').replace(/ /g, '').replace(/,/g, '_');
            this.full_history_fp = `./bots/${this.name}/histories/${string_timestamp}.json`;
            await new Promise((resolve) => {
            writeFileSync(this.full_history_fp, '[]', 'utf8');
                resolve();
            });
        }
        try {
            const data = await new Promise((resolve, reject) => {
                try {
                    const content = readFileSync(this.full_history_fp, 'utf8');
                    resolve(content);
                } catch (err) {
                    reject(err);
                }
            });
            let full_history = JSON.parse(data);
            full_history.push(...to_store);
            await new Promise((resolve) => {
            writeFileSync(this.full_history_fp, JSON.stringify(full_history, null, 4), 'utf8');
                resolve();
            });
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
            await new Promise((resolve) => {
            writeFileSync(this.memory_fp, JSON.stringify(data, null, 2));
                resolve();
            });
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

    // 执行记忆操作的主函数
    async executeMemoryOperation(operation) {
        const { method, params } = operation;
        
        // 记录执行的操作命令
        this.logOperation('memory_operation', operation);
        
        let result = null;
        let memoriesToMerge = null;
        
        switch (method.toLowerCase()) {
            case 'newmem':
                result = await this.createMemory(params.memory, 'auto', params.memoryType ? params.memoryType.toLowerCase() : 'event');
                break;
            case 'mergemem':
                // 在合并之前先找到要合并的记忆
                memoriesToMerge = this.memories.filter(mem => params.mem_ids.includes(mem.id));
                if (memoriesToMerge.length !== params.mem_ids.length) {
                    console.warn("Some memory IDs not found");
                    return null;
                }
                // 执行合并操作
                result = await this.mergeMemories(params.mem_ids, params.mergeResult, params.memoryType ? params.memoryType.toLowerCase() : 'event');
                // 记录合并操作
                if (result) {
                    this.logOperation('merge_memory', result, memoriesToMerge);
                }
                break;
            case 'nomerge':
                // 记录不需要合并的决定
                this.logOperation('no_merge_decision', {
                    message: "AI决定不需要合并记忆",
                    timestamp: this.getFormattedTimestamp()
                });
                return { status: 'success', message: 'No merge needed' };
            default:
                console.warn(`Unknown memory operation: ${method}`);
                this.logOperation('unknown_operation', operation);
                return null;
        }
        
        // 记录操作结果（除了合并操作，因为合并操作已经单独记录了）
        if (result && method.toLowerCase() !== 'mergemem') {
            this.logOperation('operation_result', {
                operation: method.toLowerCase(),
                params: params,
                result: result
            });
        }
        
        return result;
    }

    // 创建新记忆
    async createMemory(memoryContent, triggerType = 'auto', memoryType = 'event') {
        console.log("Creating new memory...");
        
        // Truncate if needed
        let finalMemory = memoryContent;
        if (finalMemory.length > 500) {
            finalMemory = finalMemory.slice(0, 500) + '...(Memory truncated to 500 chars)';
        }

        // Get timestamps
        const timestamp = this.getFormattedTimestamp();
        
        // 生成记忆ID
        const memoryId = this.generateMemoryId(timestamp);

        // Create memory entry
        const entry = {
            id: memoryId,
            created_at: timestamp,
            memory: finalMemory,
            trigger_type: triggerType,
            memory_type: typeof memoryType === 'string' ? memoryType.toLowerCase() : 'event',
            message_timeframe: {
                earliest: timestamp,
                latest: timestamp
            }
        };
        
        this.memories.push(entry);
        
        // 记录创建记忆操作
        this.logOperation('create_memory', entry);
        
        // Create embedding for new memory if embedding model is available
        if (this.embedding_model) {
            try {
                this.memory_embeddings[finalMemory] = await this.embedding_model.embed(finalMemory);
            } catch (error) {
                console.warn('Error creating embedding for new memory:', error.message);
            }
        }
        
        console.log(`Memory created: ${timestamp}, id: ${memoryId}, type: ${entry.memory_type}`);
        return entry;
    }

    // 合并记忆
    async mergeMemories(memoryIds, mergedContent, memoryType = 'event') {
        console.log("Merging memories...", memoryIds);
        
        // 处理记忆类型，确保是小写字符串
        const processedMemoryType = typeof memoryType === 'string' ? memoryType.toLowerCase() : 'event';
        
        // 找到要合并的记忆
        const memoriesToMerge = this.memories.filter(mem => memoryIds.includes(mem.id));
        const notFoundIds = memoryIds.filter(id => !memoriesToMerge.some(mem => mem.id === id));
        
        if (memoriesToMerge.length === 0) {
            console.warn("No memories found for merging");
            return null;
        }

        if (notFoundIds.length > 0) {
            console.warn(`Some memory IDs not found: ${notFoundIds.join(', ')}`);
            console.log(`Proceeding with merging ${memoriesToMerge.length} found memories...`);
        }

        // 获取最早和最晚的时间戳
        const timeframes = memoriesToMerge.map(mem => mem.message_timeframe);
        const earliest = timeframes.reduce((min, tf) => 
            tf.earliest < min ? tf.earliest : min, timeframes[0].earliest);
        const latest = timeframes.reduce((max, tf) => 
            tf.latest > max ? tf.latest : max, timeframes[0].latest);

        // 创建新的合并记忆
        const mergedMemory = await this.createMemory(mergedContent, 'merge', processedMemoryType);
        
        // 更新时间范围
        mergedMemory.message_timeframe = {
            earliest,
            latest
        };

        // 记录哪些ID未找到
        if (notFoundIds.length > 0) {
            mergedMemory.merge_info = {
                attempted_ids: memoryIds,
                not_found_ids: notFoundIds,
                merged_ids: memoriesToMerge.map(mem => mem.id)
            };
        }

        // 从记忆列表中移除旧记忆
        this.memories = this.memories.filter(mem => !memoriesToMerge.map(m => m.id).includes(mem.id));
        
        // 从embeddings中移除旧记忆
        memoriesToMerge.forEach(mem => {
            delete this.memory_embeddings[mem.memory];
        });

        return mergedMemory;
    }

    // 用于记录操作日志到文件
    logOperation(operationType, data, originalData = null) {
        try {
            const timestamp = this.getFormattedTimestamp();
            const logFilePath = `./bots/${this.name}/history_logger.txt`;
            
            let logMessage = `\n\n[${timestamp}] ${operationType.toUpperCase()}\n`;
            logMessage += '-----------------------------------------------------\n';
            
            switch (operationType) {
                case 'raw_llm_response':
                    logMessage += `LLM返回的原始响应:\n${JSON.stringify(data, null, 2)}\n`;
                    break;
                case 'create_memory':
                    logMessage += `创建新记忆:\n${JSON.stringify(data, null, 2)}\n`;
                    break;
                case 'merge_memory':
                    logMessage += `合并记忆操作:\n`;
                    logMessage += `原记忆数据:\n${JSON.stringify(originalData, null, 2)}\n\n`;
                    logMessage += `合并后的记忆:\n${JSON.stringify(data, null, 2)}\n\n`;
                    logMessage += `内容对照:\n`;
                    logMessage += `原来:\n${originalData.map(mem => mem.memory).join('\n')}\n`;
                    logMessage += `合并: ${data.memory}\n`;
                    break;
                case 'memory_operation':
                    logMessage += `执行记忆操作指令:\n${JSON.stringify(data, null, 2)}\n`;
                    break;
                case 'operation_result':
                    logMessage += `操作结果:\n`;
                    logMessage += `操作类型: ${data.operation}\n`;
                    logMessage += `参数: ${JSON.stringify(data.params, null, 2)}\n`;
                    logMessage += `结果: ${JSON.stringify(data.result, null, 2)}\n`;
                    break;
                case 'no_merge_decision':
                    logMessage += `不需要合并记忆的决定:\n`;
                    logMessage += `时间: ${data.timestamp}\n`;
                    logMessage += `消息: ${data.message}\n`;
                    break;
                case 'unknown_operation':
                    logMessage += `未知操作类型:\n${JSON.stringify(data, null, 2)}\n`;
                    break;
                default:
                    logMessage += `${operationType}:\n${JSON.stringify(data, null, 2)}\n`;
                    if (originalData) {
                        logMessage += `原始数据:\n${JSON.stringify(originalData, null, 2)}\n`;
                    }
            }
            
            logMessage += '-----------------------------------------------------\n';
            
            // 如果文件不存在，创建它
            if (!existsSync(logFilePath)) {
                writeFileSync(logFilePath, '', 'utf8');
            }
            
            // 追加日志到文件
            appendFileSync(logFilePath, logMessage, 'utf8');
            console.log(`操作日志已写入: ${logFilePath}`);
        } catch (error) {
            console.error('写入操作日志失败:', error);
        }
    }
}