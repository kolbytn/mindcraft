import { Vec3 } from 'vec3';

export class ConstructionTaskValidator {
    constructor(data, agent) {
        this.blueprint = new Blueprint(data.blueprint);
        this.agent = agent;
    }
    validate() {
        try {
            //todo: somehow make this more of a percentage or something
            console.log('Validating task...');
            let valid = false;
            let score = 0;
            let result = this.blueprint.check(this.agent.bot);
            if (result.mismatches.length === 0) {
                valid = true;
                console.log('Task is complete');
            }
            let total_blocks = result.mismatches.length + result.matches.length;
            score = (result.matches.length / total_blocks) * 100;
            console.log(`Task is ${score}% complete`);
            return valid;
        } catch (error) {
            console.error('Error validating task:', error);
            return false;
        }
    }
}

export function resetConstructionWorld(bot, blueprint) {
    console.log('Resetting world...');
    const starting_position = blueprint.levels[0].coordinates;
    const length = blueprint.levels[0].placement.length + 5;
    const height = blueprint.levels.length + 5;
    const width = blueprint.levels[0].placement[0].length + 5;
    const command = `/fill ${starting_position[0]} ${starting_position[1]} ${starting_position[2]} ${starting_position[0] + width} ${starting_position[1] + height} ${starting_position[2] + length} air`;
    bot.chat(command);
    console.log('World reset');
}

export function checkLevelBlueprint(agent, levelNum) {
    const blueprint = agent.task.blueprint;
    const bot = agent.bot;
    const result = blueprint.checkLevel(bot, levelNum);
    if (result.mismatches.length === 0) {
        return `Level ${levelNum} is correct`;
    } else {
        let explanation = blueprint.explainLevelDifference(bot, levelNum);
        return explanation;
    }
}

export function checkBlueprint(agent) {
    console.log('Checking blueprint...');
    console.log(agent);
    const blueprint = agent.task.blueprint;
    const bot = agent.bot;
    const result = blueprint.check(bot);
    if (result.mismatches.length === 0) {
        return "Blueprint is correct";
    } else {
        let explanation = blueprint.explainBlueprintDifference(bot);
        return explanation;
    }
}
export class Blueprint {
    constructor(blueprint) {
        this.data = blueprint;
    }
    explain() {
        var explanation = "";
        for (let item of this.data.levels) {
            var coordinates = item.coordinates;
            explanation += `Level ${item.level}: `;
            explanation += `Start at coordinates X: ${coordinates[0]}, Y: ${coordinates[1]}, Z: ${coordinates[2]}`;
            let placement_string = this._getPlacementString(item.placement);
            explanation += `\n${placement_string}\n`;
        }
        return explanation;
    }
    _getPlacementString(placement) {
        var placement_string = "[\n";
        for (let row of placement) {
            placement_string += "[";
            for (let i = 0; i < row.length - 1; i++) {
                let item = row[i];
                placement_string += `${item}, `;
            }
            let final_item = row[row.length - 1];
            placement_string += `${final_item}],\n`;
        }
        placement_string += "]";
        return placement_string;
    }
    explainLevel(levelNum) {
        const levelData = this.data.levels[levelNum];
        var explanation = `Level ${levelData.level} `;
        explanation += `starting at coordinates X: ${levelData.coordinates[0]}, Y: ${levelData.coordinates[1]}, Z: ${levelData.coordinates[2]}`;
        let placement_string = this._getPlacementString(levelData.placement);
        explanation += `\n${placement_string}\n`;
        return explanation;
    }
    explainBlueprintDifference(bot) {
        var explanation = "";
        const levels = this.data.levels;
        for (let i = 0; i < levels.length; i++) {
            let level_explanation = this.explainLevelDifference(bot, i);
            explanation += level_explanation + "\n";
        }
        return explanation;
    }
    explainLevelDifference(bot, levelNum) {
        const results = this.checkLevel(bot, levelNum);
        const mismatches = results.mismatches;
        const levelData = this.data.levels[levelNum];

        if (mismatches.length === 0) {
            return `Level ${levelData.level} is complete`;
        }
        var explanation = `Level ${levelData.level} `;
        // explanation += `at coordinates X: ${levelData.coordinates[0]}, Y: ${levelData.coordinates[1]}, Z: ${levelData.coordinates[2]}`;
        explanation += " requires the following fixes:\n";
        for (let item of mismatches) {
            if (item.actual === 'air') { 
                explanation += `Place ${item.expected} at coordinates X: ${item.coordinates[0]}, Y: ${item.coordinates[1]}, Z: ${item.coordinates[2]}\n`;
            } else if (item.expected === 'air') {
                explanation += `Remove the ${item.actual} at coordinates X: ${item.coordinates[0]}, Y: ${item.coordinates[1]}, Z: ${item.coordinates[2]}\n`;
            } else {
                explanation += `Replace the ${item.actual} with a ${item.expected} at coordinates X: ${item.coordinates[0]}, Y: ${item.coordinates[1]}, Z: ${item.coordinates[2]} \n`;
            }
        }
        return explanation;
    }
    check(bot) {
        if (!bot || typeof bot !== 'object' || !bot.hasOwnProperty('blockAt')) {
            throw new Error('Invalid bot object. Expected a mineflayer bot.');
        }
        const levels = this.data.levels;
        const mismatches = [];
        const matches = [];
        for (let i = 0; i < levels.length; i++) {
            const result = this.checkLevel(bot, i);
            mismatches.push(...result.mismatches);
            matches.push(...result.matches);
        }
        return {
            "mismatches": mismatches,
            "matches": matches
        };
    }
    checkLevel(bot, levelNum) {
        const levelData = this.data.levels[levelNum];
        const startCoords = levelData.coordinates;
        const placement = levelData.placement;
        const mismatches = [];
        const matches = [];
    
        for (let zOffset = 0; zOffset < placement.length; zOffset++) {
            const row = placement[zOffset];
            for (let xOffset = 0; xOffset < row.length; xOffset++) {
                const blockName = row[xOffset];
    
                const x = startCoords[0] + xOffset;
                const y = startCoords[1];
                const z = startCoords[2] + zOffset;
    
                try {
                    const blockAtLocation = bot.blockAt(new Vec3(x, y, z));
                    if (!blockAtLocation || blockAtLocation.name !== blockName) {
                        mismatches.push({
                            level: levelData.level,
                            coordinates: [x, y, z],
                            expected: blockName,
                            actual: blockAtLocation ? bot.registry.blocks[blockAtLocation.type].name : 'air' // Assuming air if no block
                        });
                    } else {
                        matches.push({
                            level: levelData.level,
                            coordinates: [x, y, z],
                            expected: blockName,
                            actual: blockAtLocation ? bot.registry.blocks[blockAtLocation.type].name : 'air' // Assuming air if no block
                        });
                    }
                } catch (err) {
                    console.error(`Error getting block at (${x}, ${y}, ${z}):`, err);
                    return false; // Stop checking if there's an issue getting blocks
                }
            }
        }
        return {
            "mismatches": mismatches,
            "matches": matches
        };
    }

    /**
     * Takes in the blueprint, and then converts it into a set of /setblock commands for the bot to follow
     * @Returns: An object containing the setblock commands as a list of strings, and a position nearby the blueprint but not in it
     * @param blueprint
     */
    autoBuild() {
        const commands = [];
        let blueprint = this.data

        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;

        for (const level of blueprint.levels) {
            console.log(level.level)
            const baseX = level.coordinates[0];
            const baseY = level.coordinates[1];
            const baseZ = level.coordinates[2];
            const placement = level.placement;

            // Update bounds
            minX = Math.min(minX, baseX);
            maxX = Math.max(maxX, baseX + placement[0].length - 1);
            minY = Math.min(minY, baseY);
            maxY = Math.max(maxY, baseY);
            minZ = Math.min(minZ, baseZ);
            maxZ = Math.max(maxZ, baseZ + placement.length - 1);

            // Loop through the 2D placement array
            for (let z = 0; z < placement.length; z++) {
                for (let x = 0; x < placement[z].length; x++) {
                    const blockType = placement[z][x];
                    if (blockType) {
                        const setblockCommand = `/setblock ${baseX + x} ${baseY} ${baseZ + z} ${blockType}`;
                        commands.push(setblockCommand);
                    }
                }
            }
        }

        // Calculate a position nearby the blueprint but not in it
        const nearbyPosition = {
            x: maxX + 5, // Move 5 blocks to the right
            y: minY,     // Stay on the lowest level of the blueprint
            z: minZ      // Stay aligned with the front of the blueprint
        };

        return { commands, nearbyPosition };
    }


    /**
     * Takes in a blueprint, and returns a set of commands to clear up the space.
     *
     */
    autoDelete() {
        const commands = [];
        let blueprint = this.data

        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;

        for (const level of blueprint.levels) {
            const baseX = level.coordinates[0];
            const baseY = level.coordinates[1];
            const baseZ = level.coordinates[2];
            const placement = level.placement;

            // Update bounds
            minX = Math.min(minX, baseX);
            maxX = Math.max(maxX, baseX + placement[0].length - 1);
            minY = Math.min(minY, baseY);
            maxY = Math.max(maxY, baseY);
            minZ = Math.min(minZ, baseZ);
            maxZ = Math.max(maxZ, baseZ + placement.length - 1);

            // Loop through the 2D placement array
            for (let z = 0; z < placement.length; z++) {
                for (let x = 0; x < placement[z].length; x++) {
                    const blockType = placement[z][x];
                    if (blockType) {
                        const setblockCommand = `/setblock ${baseX + x} ${baseY} ${baseZ + z} air`;
                        commands.push(setblockCommand);
                    }
                }
            }
        }

        // Calculate a position nearby the blueprint but not in it
        const nearbyPosition = {
            x: maxX + 5, // Move 5 blocks to the right
            y: minY,     // Stay on the lowest level of the blueprint
            z: minZ      // Stay aligned with the front of the blueprint
        };

        return { commands, nearbyPosition };
    } 
}