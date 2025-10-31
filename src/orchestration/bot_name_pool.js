/**
 * Bot Name Pool Manager
 *
 * Manages allocation and release of pre-whitelisted bot names.
 * Solves the whitelist problem for autonomous bot spawning.
 *
 * Pattern:
 * - Pre-whitelist fixed names (gatherer-1, gatherer-2, etc.)
 * - Allocate name when bot spawns
 * - Release name when bot disconnects
 * - Reuse names for new bots
 *
 * Pool sizes (configurable in settings.js):
 * - Gatherer: 20 slots
 * - Crafter: 20 slots
 * - Builder: 20 slots
 * - Scout: 10 slots
 * - Architect: 10 slots
 * - Tester: 10 slots
 * Total: 90 concurrent bot slots
 */

export class BotNamePool {
    constructor(config = null) {
        // Default pool configuration
        this.config = config || {
            'Gatherer': 20,
            'Crafter': 20,
            'Builder': 20,
            'Scout': 10,
            'Architect': 10,
            'Tester': 10
        };

        // Initialize pools
        this.pools = {};
        this.allocated = {}; // Maps allocated names to allocation time

        for (const [role, count] of Object.entries(this.config)) {
            this.pools[role] = [];

            // Generate names for this role
            // gatherer-1, gatherer-2, ..., gatherer-20
            for (let i = 1; i <= count; i++) {
                const name = `${role.toLowerCase()}-${i}`;
                this.pools[role].push(name);
            }
        }

        console.log('[BotNamePool] Initialized with', this.getTotalCapacity(), 'bot slots');
    }

    /**
     * Allocate a bot name from the pool for a specific role
     *
     * @param {string} role - Bot role (Gatherer, Crafter, Builder, etc.)
     * @returns {string|null} - Allocated bot name or null if pool exhausted
     */
    allocateName(role) {
        if (!this.pools[role]) {
            console.error(`[BotNamePool] Unknown role: ${role}`);
            return null;
        }

        if (this.pools[role].length === 0) {
            console.error(`[BotNamePool] Pool exhausted for role: ${role}`);
            console.error(`[BotNamePool] All ${this.config[role]} ${role} slots in use`);
            return null;
        }

        // Pop name from pool
        const name = this.pools[role].shift();

        // Track allocation
        this.allocated[name] = {
            role: role,
            allocatedAt: Date.now()
        };

        console.log(`[BotNamePool] Allocated: ${name} (${this.getAvailableCount(role)} ${role} slots remaining)`);

        return name;
    }

    /**
     * Release a bot name back to the pool
     *
     * @param {string} name - Bot name to release (e.g., "gatherer-3")
     */
    releaseName(name) {
        if (!this.allocated[name]) {
            console.warn(`[BotNamePool] Attempted to release unallocated name: ${name}`);
            return;
        }

        const { role, allocatedAt } = this.allocated[name];
        const duration = Math.round((Date.now() - allocatedAt) / 1000);

        // Add back to pool
        this.pools[role].push(name);
        delete this.allocated[name];

        console.log(`[BotNamePool] Released: ${name} (used for ${duration}s, ${this.getAvailableCount(role)} ${role} slots available)`);
    }

    /**
     * Get number of available names for a role
     *
     * @param {string} role - Bot role
     * @returns {number} - Number of available slots
     */
    getAvailableCount(role) {
        if (!this.pools[role]) {
            return 0;
        }
        return this.pools[role].length;
    }

    /**
     * Get number of allocated names for a role
     *
     * @param {string} role - Bot role
     * @returns {number} - Number of allocated slots
     */
    getAllocatedCount(role) {
        let count = 0;
        for (const [name, data] of Object.entries(this.allocated)) {
            if (data.role === role) {
                count++;
            }
        }
        return count;
    }

    /**
     * Get total pool capacity
     *
     * @returns {number} - Total bot slots across all roles
     */
    getTotalCapacity() {
        return Object.values(this.config).reduce((sum, count) => sum + count, 0);
    }

    /**
     * Get current pool status
     *
     * @returns {Object} - Status object with available/allocated counts per role
     */
    getStatus() {
        const status = {};

        for (const role of Object.keys(this.config)) {
            status[role] = {
                total: this.config[role],
                available: this.getAvailableCount(role),
                allocated: this.getAllocatedCount(role)
            };
        }

        return status;
    }

    /**
     * Get pool configuration
     *
     * @returns {Object} - Pool size configuration
     */
    getPoolConfig() {
        return { ...this.config };
    }

    /**
     * Check if allocation is possible for a role
     *
     * @param {string} role - Bot role
     * @returns {boolean} - True if name can be allocated
     */
    canAllocate(role) {
        return this.getAvailableCount(role) > 0;
    }

    /**
     * Get all allocated names
     *
     * @returns {Array} - Array of currently allocated names
     */
    getAllocatedNames() {
        return Object.keys(this.allocated);
    }

    /**
     * Force release all names (cleanup on shutdown)
     */
    releaseAll() {
        const allocatedNames = Object.keys(this.allocated);
        console.log(`[BotNamePool] Force releasing ${allocatedNames.length} allocated names`);

        for (const name of allocatedNames) {
            this.releaseName(name);
        }
    }

    /**
     * Clean up stale allocations (names allocated for > maxAge seconds)
     *
     * @param {number} maxAge - Maximum age in seconds (default: 3600 = 1 hour)
     * @returns {number} - Number of stale allocations released
     */
    cleanupStaleAllocations(maxAge = 3600) {
        const now = Date.now();
        const maxAgeMs = maxAge * 1000;
        let cleaned = 0;

        for (const [name, data] of Object.entries(this.allocated)) {
            const age = now - data.allocatedAt;
            if (age > maxAgeMs) {
                console.warn(`[BotNamePool] Cleaning up stale allocation: ${name} (${Math.round(age / 1000)}s old)`);
                this.releaseName(name);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`[BotNamePool] Cleaned up ${cleaned} stale allocations`);
        }

        return cleaned;
    }

    /**
     * Get summary string for logging
     *
     * @returns {string} - Human-readable summary
     */
    getSummary() {
        const status = this.getStatus();
        let summary = 'Bot Name Pool Status:\n';

        for (const [role, data] of Object.entries(status)) {
            const utilization = Math.round((data.allocated / data.total) * 100);
            summary += `  ${role}: ${data.allocated}/${data.total} in use (${utilization}%)\n`;
        }

        return summary.trim();
    }
}

/**
 * Global singleton instance
 * Initialized lazily on first use
 */
let globalPool = null;

/**
 * Get or create global bot name pool instance
 *
 * @param {Object} config - Optional pool configuration
 * @returns {BotNamePool} - Global pool instance
 */
export function getGlobalPool(config = null) {
    if (!globalPool) {
        globalPool = new BotNamePool(config);
    }
    return globalPool;
}

/**
 * Reset global pool (for testing)
 */
export function resetGlobalPool() {
    if (globalPool) {
        globalPool.releaseAll();
    }
    globalPool = null;
}
