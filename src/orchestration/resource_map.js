/**
 * Resource Map - Shared knowledge base for bot-discovered resources
 *
 * All bots can write resource locations they discover.
 * Andy can query to find nearest resources.
 * Orchestrator uses this to assign efficient gathering tasks.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export class ResourceMap {
    constructor(baseDir = process.cwd()) {
        this.baseDir = baseDir;
        this.mapFile = path.join(baseDir, '.mindcraft-agents', 'resource-map.md');
        this.jsonFile = path.join(baseDir, '.mindcraft-agents', 'resource-map.json');
        this.resources = [];
    }

    /**
     * Initialize resource map
     */
    async init() {
        const dir = path.join(this.baseDir, '.mindcraft-agents');
        if (!existsSync(dir)) {
            await mkdir(dir, { recursive: true });
        }

        // Load existing map if it exists
        if (existsSync(this.jsonFile)) {
            await this.load();
        } else {
            // Create new map
            this.resources = [];
            await this.save();
        }
    }

    /**
     * Load resource map from JSON
     */
    async load() {
        try {
            const data = await readFile(this.jsonFile, 'utf-8');
            this.resources = JSON.parse(data);
            console.log(`[ResourceMap] Loaded ${this.resources.length} resource locations`);
        } catch (error) {
            console.error('[ResourceMap] Error loading map:', error);
            this.resources = [];
        }
    }

    /**
     * Save resource map to JSON and Markdown
     */
    async save() {
        try {
            // Save JSON (for programmatic access)
            await writeFile(this.jsonFile, JSON.stringify(this.resources, null, 2));

            // Save Markdown (for human/bot readability)
            const markdown = this._generateMarkdown();
            await writeFile(this.mapFile, markdown);

            console.log(`[ResourceMap] Saved ${this.resources.length} resource locations`);
        } catch (error) {
            console.error('[ResourceMap] Error saving map:', error);
        }
    }

    /**
     * Generate human-readable markdown
     */
    _generateMarkdown() {
        let md = '# Minecraft Resource Map\n\n';
        md += `**Last Updated:** ${new Date().toISOString()}\n\n`;
        md += `**Total Resources Logged:** ${this.resources.length}\n\n`;
        md += '---\n\n';

        // Group by resource type
        const byType = {};
        for (const res of this.resources) {
            if (!byType[res.type]) {
                byType[res.type] = [];
            }
            byType[res.type].push(res);
        }

        // Sort types alphabetically
        const types = Object.keys(byType).sort();

        for (const type of types) {
            md += `## ${type}\n\n`;
            md += '| Coordinates | Abundance | Discovered By | When | Notes |\n';
            md += '|-------------|-----------|---------------|------|-------|\n';

            // Sort by timestamp (newest first)
            const sorted = byType[type].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            for (const res of sorted) {
                const coords = `(${res.x}, ${res.y}, ${res.z})`;
                const time = new Date(res.timestamp).toLocaleString();
                md += `| ${coords} | ${res.abundance || 'unknown'} | ${res.discoveredBy} | ${time} | ${res.notes || '-'} |\n`;
            }

            md += '\n';
        }

        md += '---\n\n';
        md += '## How to Use\n\n';
        md += '**Andy/Bots can query:**\n';
        md += '- `!findResource("oak_log")` - Find nearest oak logs\n';
        md += '- `!findResource("stone")` - Find nearest stone\n';
        md += '- `!checkResourceMap()` - View all resources\n\n';
        md += '**Bots log resources:**\n';
        md += '- Scouts automatically log during exploration\n';
        md += '- Gatherers log when they find new resource clusters\n';
        md += '- Use: `!logResource("oak_log", x, y, z, "Dense forest, 50+ trees")`\n';

        return md;
    }

    /**
     * Log a resource location
     *
     * @param {string} type - Resource type (oak_log, stone, iron_ore, etc.)
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {number} z - Z coordinate
     * @param {string} discoveredBy - Bot name who found it
     * @param {string} abundance - How much (sparse, moderate, dense, abundant)
     * @param {string} notes - Additional notes
     */
    async logResource(type, x, y, z, discoveredBy, abundance = 'unknown', notes = '') {
        const resource = {
            type: type.toLowerCase().replace(/\s+/g, '_'),
            x: Math.floor(x),
            y: Math.floor(y),
            z: Math.floor(z),
            discoveredBy,
            abundance,
            notes,
            timestamp: new Date().toISOString()
        };

        // Check for duplicates (within 10 blocks)
        const duplicate = this.resources.find(r =>
            r.type === resource.type &&
            Math.abs(r.x - resource.x) < 10 &&
            Math.abs(r.z - resource.z) < 10
        );

        if (duplicate) {
            console.log(`[ResourceMap] Resource ${type} at (${x}, ${y}, ${z}) already logged, skipping`);
            return false;
        }

        this.resources.push(resource);
        await this.save();

        console.log(`[ResourceMap] Logged ${type} at (${x}, ${y}, ${z}) by ${discoveredBy}`);
        return true;
    }

    /**
     * Find nearest resource of a type
     *
     * @param {string} type - Resource type to find
     * @param {number} fromX - Current X position
     * @param {number} fromY - Current Y position
     * @param {number} fromZ - Current Z position
     * @param {number} maxDistance - Maximum distance to search (default: 1000)
     * @returns {Object|null} - Nearest resource or null
     */
    findNearest(type, fromX, fromY, fromZ, maxDistance = 1000) {
        const normalizedType = type.toLowerCase().replace(/\s+/g, '_');

        // Filter by type
        const matching = this.resources.filter(r => r.type === normalizedType);

        if (matching.length === 0) {
            return null;
        }

        // Calculate distances
        const withDistances = matching.map(r => ({
            ...r,
            distance: Math.sqrt(
                Math.pow(r.x - fromX, 2) +
                Math.pow(r.y - fromY, 2) +
                Math.pow(r.z - fromZ, 2)
            )
        }));

        // Filter by max distance and sort
        const inRange = withDistances
            .filter(r => r.distance <= maxDistance)
            .sort((a, b) => a.distance - b.distance);

        return inRange.length > 0 ? inRange[0] : null;
    }

    /**
     * Find all resources of a type
     *
     * @param {string} type - Resource type
     * @returns {Array} - All resources of that type
     */
    findAll(type) {
        const normalizedType = type.toLowerCase().replace(/\s+/g, '_');
        return this.resources.filter(r => r.type === normalizedType);
    }

    /**
     * Get all resource types
     *
     * @returns {Array} - List of unique resource types
     */
    getResourceTypes() {
        const types = new Set(this.resources.map(r => r.type));
        return Array.from(types).sort();
    }

    /**
     * Get summary of all resources
     *
     * @returns {Object} - Summary object
     */
    getSummary() {
        const byType = {};
        for (const res of this.resources) {
            if (!byType[res.type]) {
                byType[res.type] = {
                    count: 0,
                    locations: []
                };
            }
            byType[res.type].count++;
            byType[res.type].locations.push({
                coords: `(${res.x}, ${res.y}, ${res.z})`,
                discoveredBy: res.discoveredBy,
                abundance: res.abundance
            });
        }

        return {
            totalResources: this.resources.length,
            totalTypes: Object.keys(byType).length,
            byType
        };
    }

    /**
     * Clear old resources (older than X days)
     *
     * @param {number} days - Age in days
     * @returns {number} - Number of resources removed
     */
    async cleanOldResources(days = 7) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);

        const before = this.resources.length;
        this.resources = this.resources.filter(r => new Date(r.timestamp) > cutoff);
        const removed = before - this.resources.length;

        if (removed > 0) {
            await this.save();
            console.log(`[ResourceMap] Cleaned ${removed} old resources (>${days} days)`);
        }

        return removed;
    }

    /**
     * Remove specific resource
     *
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {number} z - Z coordinate
     * @returns {boolean} - True if removed
     */
    async removeResource(x, y, z) {
        const before = this.resources.length;
        this.resources = this.resources.filter(r =>
            !(Math.abs(r.x - x) < 5 && Math.abs(r.y - y) < 5 && Math.abs(r.z - z) < 5)
        );

        if (this.resources.length < before) {
            await this.save();
            console.log(`[ResourceMap] Removed resource at (${x}, ${y}, ${z})`);
            return true;
        }

        return false;
    }
}

// Global singleton instance
let globalResourceMap = null;

/**
 * Get or create global resource map
 *
 * @returns {ResourceMap} - Global instance
 */
export function getGlobalResourceMap() {
    if (!globalResourceMap) {
        globalResourceMap = new ResourceMap();
    }
    return globalResourceMap;
}

/**
 * Reset global resource map (for testing)
 */
export function resetGlobalResourceMap() {
    globalResourceMap = null;
}
