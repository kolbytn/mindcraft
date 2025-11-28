/**
 * Utility for rate-limited operations with exponential backoff retry
 */

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
 * Process items with embedding, showing progress and handling rate limits
 * @param {Array} items - Items to process
 * @param {Function} embedFn - Async function to embed an item: (item, index) => embedding
 * @param {string} label - Label for progress display (e.g., "examples", "skills")
 * @param {Object} options - Retry options
 * @returns {Promise<Map>} Map of item -> embedding
 */
export async function embedWithProgress(items, embedFn, label = 'items', options = {}) {
    const results = new Map();
    const total = items.length;
    
    if (total === 0) return results;
    
    console.log(`Embedding ${total} ${label}...`);
    
    for (let i = 0; i < total; i++) {
        const item = items[i];
        const progress = `[${i + 1}/${total}]`;
        const percent = Math.round(((i + 1) / total) * 100);
        const bar = '█'.repeat(Math.floor(percent / 5)) + '░'.repeat(20 - Math.floor(percent / 5));
        
        try {
            const embedding = await withRetry(() => embedFn(item, i), options);
            results.set(item, embedding);
            
            // Update progress bar (using \r to overwrite line)
            process.stdout.write(`\r${label}: ${bar} ${percent}% ${progress}`);
        } catch (err) {
            console.error(`\nFailed to embed ${label} item ${i + 1}: ${err.message}`);
            throw err;
        }
    }
    
    console.log(); // New line after progress bar
    return results;
}
