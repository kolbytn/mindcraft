import { readFileSync } from 'fs';
import { executeCommand } from './commands/index.js';
import { getPosition } from './library/world.js'
import settings from '../../settings.js';
import { Vec3 } from 'vec3';

//todo: modify validator code to return an object with valid and score -> do more testing hahah
//todo: figure out how to log these things to the same place as bots/histories
export class CraftTaskValidator {
    constructor(data, agent) {
        this.target = data.target;
        this.number_of_target = data.number_of_target;
        this.agent = agent;
    }

    validate() {
        try{
            let valid = false;
            let total_targets = 0;
            this.agent.bot.inventory.slots.forEach((slot) => {
                if (slot && slot.name.toLowerCase() === this.target) {
                    total_targets += slot.count;
                }
                if (slot && slot.name.toLowerCase() === this.target && slot.count >= this.number_of_target) {
                    valid = true;
                    console.log('Task is complete');
                }
            });
            if (total_targets >= this.number_of_target) {
                valid = true;
                console.log('Task is complete');
            }
            return valid;
        } catch (error) {
            console.error('Error validating task:', error);
            return false;
        }
    }
}

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
}

export class Task {
    constructor(agent, task_path, task_id) {
        this.agent = agent;
        this.data = null;
        this.taskTimeout = 300;
        this.taskStartTime = Date.now();
        this.validator = null;
        this.blocked_actions = [];
        if (task_path && task_id) {
            this.data = this.loadTask(task_path, task_id);
            this.task_type = this.data.type;
            if (this.task_type === 'construction' && this.data.blueprint) {
                this.blueprint = new Blueprint(this.data.blueprint);
                this.goal = this.data.goal + ' \n' + this.blueprint.explain() + " \n" + "make sure to place the lower levels of the blueprint first";
                this.conversation = this.data.conversation + ' \n' + this.blueprint.explain();
            } else {
                this.goal = this.data.goal;
                this.conversation = this.data.conversation;
            }
            this.taskTimeout = this.data.timeout || 300;
            this.taskStartTime = Date.now();
            if (this.task_type === 'construction') {
                this.validator = new ConstructionTaskValidator(this.data, this.agent);
            } else if (this.task_type === 'techtree') {
                this.validator = new CraftTaskValidator(this.data, this.agent);
            }
            this.blocked_actions = this.data.blocked_actions || [];
            if (this.goal)
                this.blocked_actions.push('!endGoal');
            if (this.conversation)
                this.blocked_actions.push('!endConversation');
            console.log('Task loaded:', this.data);
        }
    }

    loadTask(task_path, task_id) {
        try {
            const tasksFile = readFileSync(task_path, 'utf8');
            const tasks = JSON.parse(tasksFile);
            const task = tasks[task_id];
            console.log('Loaded task:', task);
            if (!task) {
                throw new Error(`Task ${task_id} not found`);
            }
            if ((!task.agent_count || task.agent_count <= 1) && this.agent.count_id > 0) {
                task = null;
            }

            return task;
        } catch (error) {
            console.error('Error loading task:', error);
            process.exit(1);
        }
    }

    isDone() {
        if (this.validator && this.validator.validate())
            return {"message": 'Task successful', "code": 2};
        // TODO check for other terminal conditions
        // if (this.task.goal && !this.self_prompter.on)
        //     return {"message": 'Agent ended goal', "code": 3};
        // if (this.task.conversation && !inConversation())
        //     return {"message": 'Agent ended conversation', "code": 3};
        if (this.taskTimeout) {
            const elapsedTime = (Date.now() - this.taskStartTime) / 1000;
            if (elapsedTime >= this.taskTimeout) {
                console.log('Task timeout reached. Task unsuccessful.');
                return {"message": 'Task timeout reached', "code": 4};
            }
        }
        return false;
    }

    async initBotTask() {
        if (this.data === null)
            return;
        let bot = this.agent.bot;
        let name = this.agent.name;
    
        bot.chat(`/clear ${name}`);
        console.log(`Cleared ${name}'s inventory.`);
        
        //wait for a bit so inventory is cleared
        await new Promise((resolve) => setTimeout(resolve, 500));
    
        if (this.data.agent_count > 1) {
            var initial_inventory = this.data.initial_inventory[this.agent.count_id.toString()];
            console.log("Initial inventory:", initial_inventory);
        } else if (this.data) {
            console.log("Initial inventory:", this.data.initial_inventory);
            var initial_inventory = this.data.initial_inventory;
        }
    
        if ("initial_inventory" in this.data) {
            console.log("Setting inventory...");
            console.log("Inventory to set:", initial_inventory);
            for (let key of Object.keys(initial_inventory)) {
                console.log('Giving item:', key);
                bot.chat(`/give ${name} ${key} ${initial_inventory[key]}`);
            };
            //wait for a bit so inventory is set
            await new Promise((resolve) => setTimeout(resolve, 500));
            console.log("Done giving inventory items.");
        }
        // Function to generate random numbers
    
        function getRandomOffset(range) {
            return Math.floor(Math.random() * (range * 2 + 1)) - range;
        }
    
        let human_player_name = null;
        let available_agents = settings.profiles.map((p) => JSON.parse(readFileSync(p, 'utf8')).name);  // TODO this does not work with command line args
    
        // Finding if there is a human player on the server
        for (const playerName in bot.players) {
            const player = bot.players[playerName];
            if (!available_agents.some((n) => n === playerName)) {
                console.log('Found human player:', player.username);
                human_player_name = player.username
                break;
            }
        }

        // If there are multiple human players, teleport to the first one
    
        // teleport near a human player if found by default
    
        if (human_player_name) {
            console.log(`Teleporting ${name} to human ${human_player_name}`)
            bot.chat(`/tp ${name} ${human_player_name}`) // teleport on top of the human player
    
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
    
        // now all bots are teleport on top of each other (which kinda looks ugly)
        // Thus, we need to teleport them to random distances to make it look better
    
        /*
        Note : We don't want randomness for construction task as the reference point matters a lot.
        Another reason for no randomness for construction task is because, often times the user would fly in the air,
        then set a random block to dirt and teleport the bot to stand on that block for starting the construction,
        This was done by MaxRobinson in one of the youtube videos.
        */
    
        if (this.data.type !== 'construction') {
            const pos = getPosition(bot);
            const xOffset = getRandomOffset(5);
            const zOffset = getRandomOffset(5);
            bot.chat(`/tp ${name} ${Math.floor(pos.x + xOffset)} ${pos.y + 3} ${Math.floor(pos.z + zOffset)}`);
            await new Promise((resolve) => setTimeout(resolve, 200));
        }

        if (this.data.agent_count && this.data.agent_count > 1) {
            // TODO wait for other bots to join
            await new Promise((resolve) => setTimeout(resolve, 10000));
            if (available_agents.length < this.data.agent_count) {
                console.log(`Missing ${this.data.agent_count - available_agents.length} bot(s).`);
                this.agent.cleanKill('Not all required players/bots are present in the world. Exiting.', 4);
            }
        }

        if (this.goal) {
            console.log('Setting goal:', this.goal);
            await executeCommand(this.agent, `!goal("${this.goal}")`);
        }
    
        if (this.conversation && this.agent.count_id === 0) {
            let other_name = available_agents.filter(n => n !== name)[0];
            await executeCommand(this.agent, `!startConversation("${other_name}", "${this.conversation}")`);
        }
    }    
}

export function giveBlueprint(agent, blueprint) {
    let bot = agent.bot;
    let name = agent.name;
    let blueprint_name = blueprint.name;
    let blueprint_count = blueprint.count;
    bot.chat(`/clear ${name}`);
    console.log(`Cleared ${name}'s inventory.`);
    bot.chat(`/give ${name} ${blueprint_name} ${blueprint_count}`);
    console.log(`Gave ${name} ${blueprint_count} ${blueprint_name}(s).`);
}
