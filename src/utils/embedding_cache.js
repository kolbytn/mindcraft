/**
 * Persistent cache for embeddings to avoid re-computing on restart
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';
import path from 'path';

const CACHE_DIR = './bots/.cache';
const CACHE_VERSION = 1; // Bump this if cache format changes

/**
 * Get a hash of the content for cache keying
 */
function hashContent(content) {
    return createHash('md5').update(content).digest('hex');
}

/**
 * Load embeddings from cache
 * @param {string} cacheKey - Unique key for this cache (e.g., 'examples', 'skills')
 * @param {string} modelName - Model name to invalidate cache if model changes
 * @returns {Object|null} Cached embeddings or null if not found/invalid
 */
export function loadEmbeddingCache(cacheKey, modelName) {
    const cachePath = path.join(CACHE_DIR, `${cacheKey}_embeddings.json`);
    
    try {
        if (!existsSync(cachePath)) {
            return null;
        }
        
        const cache = JSON.parse(readFileSync(cachePath, 'utf8'));
        
        // Validate cache version and model
        if (cache.version !== CACHE_VERSION || cache.model !== modelName) {
            console.log(`Embedding cache for ${cacheKey} invalidated (model or version changed)`);
            return null;
        }
        
        console.log(`Loaded ${Object.keys(cache.embeddings).length} cached embeddings for ${cacheKey}`);
        return cache.embeddings;
    } catch (err) {
        console.warn(`Failed to load embedding cache for ${cacheKey}:`, err.message);
        return null;
    }
}

/**
 * Save embeddings to cache
 * @param {string} cacheKey - Unique key for this cache
 * @param {string} modelName - Model name for cache invalidation
 * @param {Object} embeddings - Map of text -> embedding
 */
export function saveEmbeddingCache(cacheKey, modelName, embeddings) {
    const cachePath = path.join(CACHE_DIR, `${cacheKey}_embeddings.json`);
    
    try {
        mkdirSync(CACHE_DIR, { recursive: true });
        
        const cache = {
            version: CACHE_VERSION,
            model: modelName,
            timestamp: new Date().toISOString(),
            embeddings: embeddings
        };
        
        writeFileSync(cachePath, JSON.stringify(cache), 'utf8');
        console.log(`Saved ${Object.keys(embeddings).length} embeddings to cache for ${cacheKey}`);
    } catch (err) {
        console.warn(`Failed to save embedding cache for ${cacheKey}:`, err.message);
    }
}

/**
 * Get embeddings with caching support
 * @param {Array} items - Items to embed
 * @param {Function} getTextFn - Function to extract text from item: (item) => string
 * @param {Function} embedFn - Async function to embed text: (text) => embedding
 * @param {string} cacheKey - Cache key for this set of embeddings
 * @param {string} modelName - Model name for cache invalidation
 * @param {Function} progressFn - Optional progress callback: (current, total, item) => void
 * @returns {Promise<Map>} Map of item -> embedding
 */
export async function getEmbeddingsWithCache(items, getTextFn, embedFn, cacheKey, modelName, progressFn = null) {
    const results = new Map();
    const cachedEmbeddings = loadEmbeddingCache(cacheKey, modelName) || {};
    const toEmbed = [];
    
    // Check what's already cached
    for (const item of items) {
        const text = getTextFn(item);
        const hash = hashContent(text);
        
        if (cachedEmbeddings[hash]) {
            results.set(item, cachedEmbeddings[hash]);
        } else {
            toEmbed.push({ item, text, hash });
        }
    }
    
    if (toEmbed.length === 0) {
        console.log(`All ${items.length} ${cacheKey} embeddings loaded from cache`);
        return results;
    }
    
    console.log(`Embedding ${toEmbed.length} new ${cacheKey} (${items.length - toEmbed.length} cached)...`);
    
    // Embed missing items
    const newEmbeddings = {};
    for (let i = 0; i < toEmbed.length; i++) {
        const { item, text, hash } = toEmbed[i];
        
        if (progressFn) {
            progressFn(i + 1, toEmbed.length, item);
        }
        
        const embedding = await embedFn(text);
        results.set(item, embedding);
        newEmbeddings[hash] = embedding;
        cachedEmbeddings[hash] = embedding;
    }
    
    // Save updated cache
    saveEmbeddingCache(cacheKey, modelName, cachedEmbeddings);
    
    return results;
}
