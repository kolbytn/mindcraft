/**
 * Utility for rate-limited operations with exponential backoff retry
 */

import { getEmbeddingsWithCache } from './embedding_cache.js';

/**
 * Execute an async function with exponential backoff retry on rate limit errors
 * @param {Function} fn - Async function to execute
 * @param {Object} options - Options
 * @param {number} options.maxRetries - Maximum number of retries (default: 5)
 * @param {number} options.initialDelay - Initial delay in ms (default: 1000)
 * @param {number} options.maxDelay - Maximum delay in ms (default: 60000)
 * @returns {Promise} Result of the function
 */
export async function withRetry(fn, options = {}) {
    const { maxRetries = 5, initialDelay = 1000, maxDelay = 60000 } = options;
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            const errMsg = err.message || String(err);
            
            // Check if it's a rate limit error
            const isRateLimit = errMsg.includes('429') || 
                               errMsg.includes('rate limit') || 
                               errMsg.includes('Too Many Requests') ||
                               errMsg.includes('throttled');
            
            if (!isRateLimit || attempt === maxRetries) {
                throw err;
            }
            
            // Parse retry_after from error if available, otherwise use exponential backoff
            let delay = initialDelay * Math.pow(2, attempt);
            const retryAfterMatch = errMsg.match(/retry.after[^\d]*(\d+)/i);
            if (retryAfterMatch) {
                delay = parseInt(retryAfterMatch[1]) * 1000 + 1000; // Add 1s buffer
            }
            delay = Math.min(delay, maxDelay);
            
            console.log(`Rate limited, retrying in ${(delay/1000).toFixed(1)}s (attempt ${attempt + 1}/${maxRetries})...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw lastError;
}

/**
 * Process items with embedding, showing progress, handling rate limits, and caching
 * @param {Array} items - Items to process
 * @param {Function} embedFn - Async function to embed an item: (item, index) => embedding
 * @param {string} label - Label for progress display (e.g., "examples", "skills")
 * @param {Object} options - Options including retry options and cache settings
 * @param {string} options.cacheKey - Cache key for persistent storage
 * @param {string} options.modelName - Model name for cache invalidation
 * @param {Function} options.getTextFn - Function to extract text from item for caching
 * @returns {Promise<Map>} Map of item -> embedding
 */
export async function embedWithProgress(items, embedFn, label = 'items', options = {}) {
    const { cacheKey, modelName, getTextFn } = options;
    const total = items.length;
    
    if (total === 0) return new Map();
    
    // If caching is enabled, use the cache system
    if (cacheKey && modelName && getTextFn) {
        const progressFn = (current, total, item) => {
            const percent = Math.round((current / total) * 100);
            const bar = '█'.repeat(Math.floor(percent / 5)) + '░'.repeat(20 - Math.floor(percent / 5));
            console.log(`Embedding ${label}: ${bar} ${percent}% [${current}/${total}]`);
        };
        
        const embedWithRetry = async (text) => {
            return await withRetry(() => embedFn(text), options);
        };
        
        const results = await getEmbeddingsWithCache(
            items,
            getTextFn,
            embedWithRetry,
            cacheKey,
            modelName,
            progressFn
        );
        
        if (results.size > 0) {
            console.log(`Finished loading ${results.size} ${label} embeddings.`);
        }
        return results;
    }
    
    // Fallback to non-cached embedding
    const results = new Map();
    
    for (let i = 0; i < total; i++) {
        const item = items[i];
        const progress = `[${i + 1}/${total}]`;
        const percent = Math.round(((i + 1) / total) * 100);
        const bar = '█'.repeat(Math.floor(percent / 5)) + '░'.repeat(20 - Math.floor(percent / 5));
        
        try {
            const embedding = await withRetry(() => embedFn(item, i), options);
            results.set(item, embedding);
            
            console.log(`Embedding ${label}: ${bar} ${percent}% ${progress}`);
        } catch (err) {
            console.error(`Failed to embed ${label} item ${i + 1}: ${err.message}`);
            throw err;
        }
    }
    
    console.log(`Finished embedding ${total} ${label}.`);
    return results;
}
