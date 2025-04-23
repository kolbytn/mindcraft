import { Vec3 } from 'vec3';
import { readdirSync, readFileSync } from 'fs';
import { ItemGoal } from './npc/item_goal.js';
import { BuildGoal } from './npc/build_goal.js';
import { itemSatisfied, blockSatisfied, getTypeOfGeneric, rotateXZ} from './npc/utils.js';
import { splitContentAndJSON } from '../utils/generation.js';
import * as skills from './library/skills.js';
import * as world from './library/world.js';
import * as mc from '../utils/mcdata.js';

export class BuildManager {
    constructor(agent) {
        this.agent = agent;
        this.built = {};
        this.curr_goal = null;
        this.temp_goals = [];
        this.item_goal = new ItemGoal(agent);
        this.build_goal = new BuildGoal(agent);
        this.blueprints = {};
        this.blueprint = null;
    }

    getBuiltPositions() {
        let positions = [];
        for (let name in this.built) {
            let position = this.built[name].position;
            let offset = this.blueprints[name].offset;
            let sizex = this.blueprints[name].blocks[0][0].length;
            let sizez = this.blueprints[name].blocks[0].length;
            let sizey = this.blueprints[name].blocks.length;
            for (let y = offset; y < sizey + offset; y++) {
                for (let z = 0; z < sizez; z++) {
                    for (let x = 0; x < sizex; x++) {
                        positions.push({x: position.x + x, y: position.y + y, z: position.z + z});
                    }
                }
            }
        }
        return positions;
    }

    init() {
        try {
            for (let file of readdirSync('src/agent/npc/construction/')) {
                if (file.endsWith('.json') && !file.startsWith('.')) {
                    this.blueprints[file.slice(0, -5)] = JSON.parse(readFileSync('src/agent/npc/construction/' + file, 'utf8'));
                }
            }
        } catch (e) {
            console.log('Error reading blueprint file');
        }

        for (let name in this.blueprints) {
            let sizez = this.blueprints[name].blocks[0].length;
            let sizex = this.blueprints[name].blocks[0][0].length;
            let max_size = Math.max(sizex, sizez);
            for (let y = 0; y < this.blueprints[name].blocks.length; y++) {
                for (let z = 0; z < max_size; z++) {
                    if (z >= this.blueprints[name].blocks[y].length)
                        this.blueprints[name].blocks[y].push([]);
                    for (let x = 0; x < max_size; x++) {
                        if (x >= this.blueprints[name].blocks[y][z].length)
                            this.blueprints[name].blocks[y][z].push('');
                    }
                }
            }
        }

        this.agent.bot.on('idle', async () => {
            if (!this.curr_goal) return;
            // Wait a while for inputs before acting independently
            await new Promise((resolve) => setTimeout(resolve, 5000));
            if (!this.agent.isIdle()) return;

            // Persue goal
            if (!this.agent.actions.resume_func) {
                this.executeNext();
                this.agent.history.save();
            }
        });
    }

    async setGoal(name, quantity=1, blueprint=null) {
        this.curr_goal = null;
        this.built = {};
        this.temp_goals = [];
        this.blueprint = blueprint;
        if (name) {
            this.curr_goal = {name: name, quantity: quantity};
            if (this.blueprint === null && this.blueprints[name] !== undefined)
                this.blueprint = this.blueprints[name];
            console.log('Set new building goal: ', name, ' x', quantity);
        }
    }

    async executeNext() {
        if (!this.agent.isIdle()) return;
        await this.agent.actions.runAction('npc:moveAway', async () => {
            await skills.moveAway(this.agent.bot, 2);
        });
        
        let building = this.currentBuilding();
        if (building) {
            let door_pos = this.getBuildingDoor(building);
            if (door_pos) {
                await this.agent.actions.runAction('npc:exitBuilding', async () => {
                    await skills.useDoor(this.agent.bot, door_pos);
                    await skills.moveAway(this.agent.bot, 2); 
                });
            }
        }

        // Work towards goals
        await this.executeGoal();

        if (this.agent.isIdle())
            this.agent.bot.emit('idle');
    }
    
    currentBuilding() {
        if (!this.blueprint) return null;
        let bot_pos = this.agent.bot.entity.position;
        for (let name in this.built) {
            let pos = this.built[name].position;
            let offset = this.blueprint.offset;
            let sizex = this.blueprint.blocks[0][0].length;
            let sizez = this.blueprint.blocks[0].length;
            let sizey = this.blueprint.blocks.length;
            if (this.built[name].orientation % 2 === 1) [sizex, sizez] = [sizez, sizex];
            if (bot_pos.x >= pos.x && bot_pos.x < pos.x + sizex &&
                bot_pos.y >= pos.y + offset && bot_pos.y < pos.y + sizey + offset &&
                bot_pos.z >= pos.z && bot_pos.z < pos.z + sizez) {
                return name;
            }
        }
        return null;
    }

    getBuildingDoor(name) {
        if (name === null || this.built[name] === undefined) return null;
        let door_x = null;
        let door_z = null;
        let door_y = null;
        for (let y = 0; y < this.blueprint.blocks.length; y++) {
            for (let z = 0; z < this.blueprint.blocks[y].length; z++) {
                for (let x = 0; x < this.blueprint.blocks[y][z].length; x++) {
                    if (this.blueprint.blocks[y][z][x] !== null &&
                        this.blueprint.blocks[y][z][x].includes('door')) {
                        door_x = x;
                        door_z = z;
                        door_y = y;
                        break;
                    }
                }
                if (door_x !== null) break;
            }
            if (door_x !== null) break;
        }
        if (door_x === null) return null;

        let sizex = this.blueprint.blocks[0][0].length;
        let sizez = this.blueprint.blocks[0].length;
        let orientation = 4 - this.built[name].orientation; // this conversion is opposite
        if (orientation == 4) orientation = 0;
        [door_x, door_z] = rotateXZ(door_x, door_z, orientation, sizex, sizez);
        door_y += this.blueprint.offset;

        return {
            x: this.built[name].position.x + door_x,
            y: this.built[name].position.y + door_y,
            z: this.built[name].position.z + door_z
        };
    }

    async executeGoal() {
        // If we need more blocks to complete a building, get those first
        let goals = this.temp_goals
        if (this.curr_goal)
            goals = goals.concat([this.curr_goal])
        this.temp_goals = [];

        console.log("Executing goals: ", goals);
        for (let goal of goals) {
            try {
                if (!this.blueprints[goal.name]) {
                    if (this.agent.bot.game.gameMode === "creative") 
                        this.agent.bot.chat(`/give ${this.agent.name} ${goal.name} ${goal.quantity}`)
                        await new Promise((resolve) => setTimeout(resolve, 3000));
                    if (!itemSatisfied(this.agent.bot, goal.name, goal.quantity)) {
                        let res = await this.item_goal.executeNext(goal.name, goal.quantity);
                        if (!res) {
                            this.agent.bot.chat(`I can't build ${this.curr_goal}, as stuck when get ${goal}`);
                            this.stop();
                            break;
                        }
                    }
                } else {
                    let res = null;
                    if (this.built.hasOwnProperty(goal.name)) {
                        res = await this.build_goal.executeNext(
                            this.blueprint,
                            this.built[goal.name].position,
                            this.built[goal.name].orientation
                        );
                    } else {
                        res = await this.build_goal.executeNext(this.blueprint);
                        this.built[goal.name] = {
                            name: goal.name,
                            position: res.position,
                            orientation: res.orientation
                        };
                    }
                    for (let block_name in res.missing) {
                        this.temp_goals.push({
                            name: block_name,
                            quantity: res.missing[block_name]
                        })
                    }
                    if (!res.acted) {
                        this.agent.bot.chat(`I built a ${this.curr_goal}.`);
                        this.stop();
                    } 
                }
            } catch (e) {
                console.log("Error in executing building goal: ", e);
                this.agent.bot.chat(`I can't build ${goal.name} right now.`);
                this.stop();
            }
        }
        if (this.curr_goal) {
            this.agent.bot.emit("idle");
        }
    }

    async buildWithIdea(name, idea) {
        if (this.blueprints[name] === undefined) {
            console.log(`Can't find reference blueprint: ${name}.`);
            return 
        }
        console.log("building with idea: ", name, idea)
        let prompt = this.agent.prompter.profile.build; 
        if (prompt && prompt.trim().length > 0) {
            prompt = prompt.replaceAll("$BLUEPRINT", "\n## Reference Blueprint:\n" + JSON.stringify(this.blueprints[name].blocks)).replaceAll("$IDEA", "## Design Idea:\n" + idea);
            prompt = await this.agent.prompter.replaceStrings(prompt);
            let generation = await this.agent.prompter.chat_model.sendRequest([], prompt);
            console.log(`${this.agent.name} build with idea: ""${generation}""`);
            let blocks = this.extractBlocks(generation)
            if (blocks.length > 0) {
                let blueprint = {name, offset : -1, blocks : []};
                for (let layer of blocks) {
                    if (Array.isArray(layer)) {
                        let l = [];
                        for (let row of layer) {
                            if (Array.isArray(row)) {
                                let r = [];
                                for (let block of row) {
                                    if (typeof block === "string") {
                                        r.push(block);
                                    }
                                }
                                if (r.length > 0) 
                                    l.push(row);
                            }
                        }
                        if (l.length > 0) 
                            blueprint.blocks.push(l);
                    }
                }
                if (blueprint.blocks.length > 0) {
                    console.log(`Generate blueprint to build with:\n${JSON.stringify(blueprint)}`);
                    this.setGoal(name, 1, blueprint);
                    this.agent.bot.emit('idle');
                } else {
                    console.log("No invalid blocks found in the generated blueprint.");
                } 
            } else {
                console.log("No blocks extracted from the generation.");
            }  
        }
    }

    extractBlocks(text) {
        let [content, data] = splitContentAndJSON(text);
        let blocks = [];
        if (data.blocks && Array.isArray(data.blocks)) {
            blocks = data.blocks;
        }
        return blocks 
    }

    stop() {
        this.temp_goals =[];
        this.curr_goal = null;
        this.blueprint = null;
        this.built = {};
    }
}