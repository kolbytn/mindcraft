/**
 * Simple in-memory rate limiter to prevent abuse.
 * Includes automatic stale entry cleanup to prevent memory leaks.
 */

export class RateLimiter {
    constructor(maxRequests = 5, windowMs = 60000, cleanupIntervalMs = 300000) {
        this.maxRequests = maxRequests;  // Max requests per window
        this.windowMs = windowMs;         // Time window in milliseconds
        this.requests = new Map();        // userId → [timestamps]

        // Periodically purge stale entries to prevent unbounded memory growth
        this._cleanupInterval = setInterval(() => this._purgeStale(), cleanupIntervalMs);
        // Allow the process to exit even if the interval is still running
        if (this._cleanupInterval.unref) {
            this._cleanupInterval.unref();
        }
    }

    /**
     * Check if a user has exceeded rate limit
     * @param {string} userId - Discord user ID
     * @returns {object} { allowed: boolean, retryAfterSeconds?: number }
     */
    checkLimit(userId) {
        const now = Date.now();
        const userRequests = this.requests.get(userId) || [];

        // Remove old requests outside the window
        const recentRequests = userRequests.filter(ts => now - ts < this.windowMs);

        if (recentRequests.length >= this.maxRequests) {
            // Rate limited
            const oldestRequest = recentRequests[0];
            const retryAfterMs = oldestRequest + this.windowMs - now;
            const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
            return { allowed: false, retryAfterSeconds };
        }

        // Allow and record
        recentRequests.push(now);
        this.requests.set(userId, recentRequests);
        return { allowed: true };
    }

    /**
     * Reset limits for a user (useful for admins)
     */
    reset(userId) {
        this.requests.delete(userId);
    }

    /**
     * Reset all tracked users
     */
    resetAll() {
        this.requests.clear();
    }

    /**
     * Get current stats for a user
     */
    getStats(userId) {
        const now = Date.now();
        const requests = this.requests.get(userId) || [];
        const recentRequests = requests.filter(ts => now - ts < this.windowMs);
        return {
            current: recentRequests.length,
            max: this.maxRequests,
            windowSeconds: this.windowMs / 1000,
            trackedUsers: this.requests.size,
        };
    }

    /**
     * Remove entries for users with no recent requests (prevents memory leak)
     * @private
     */
    _purgeStale() {
        const now = Date.now();
        for (const [userId, timestamps] of this.requests) {
            const recent = timestamps.filter(ts => now - ts < this.windowMs);
            if (recent.length === 0) {
                this.requests.delete(userId);
            } else {
                this.requests.set(userId, recent);
            }
        }
    }

    /**
     * Stop the automatic cleanup interval (for graceful shutdown)
     */
    destroy() {
        if (this._cleanupInterval) {
            clearInterval(this._cleanupInterval);
            this._cleanupInterval = null;
        }
    }
}
