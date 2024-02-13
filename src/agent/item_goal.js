import * as skills from './library/skills.js';
import * as world from './library/world.js';
import * as mc from '../utils/mcdata.js';


class ItemNode {
    constructor(manager, wrapper, name) {
        this.manager = manager;
        this.wrapper = wrapper;
        this.name = name;
        this.type = '';
        this.source = null;
        this.prereq = null;
        this.recipe = [];
        this.fails = 0;
    }

    setRecipe(recipe) {
        this.type = 'craft';
        let size = 0;
        for (let [key, value] of Object.entries(recipe)) {
            if (this.manager.nodes[key] === undefined)
                this.manager.nodes[key] = new ItemWrapper(this.manager, this.wrapper, key);
            this.recipe.push([this.manager.nodes[key], value]);
            size += value;
        }
        if (size > 4) {
            if (this.manager.nodes['crafting_table'] === undefined)
                this.manager.nodes['crafting_table'] = new ItemWrapper(this.manager, this.wrapper, 'crafting_table');
            this.prereq = this.manager.nodes['crafting_table'];
        }
        return this;
    }

    setCollectable(source=null, tool=null) {
        this.type = 'block';
        if (source)
            this.source = source;
        else
            this.source = this.name;
        if (tool) {
            if (this.manager.nodes[tool] === undefined)
                this.manager.nodes[tool] = new ItemWrapper(this.manager, this.wrapper, tool);
            this.prereq = this.manager.nodes[tool];
        }
        return this;
    }

    setSmeltable(source_item) {
        this.type = 'smelt';
        if (this.manager.nodes['furnace'] === undefined)
            this.manager.nodes['furnace'] = new ItemWrapper(this.manager, this.wrapper, 'furnace');
        this.prereq = this.manager.nodes['furnace'];
        if (this.manager.nodes[source_item] === undefined)
            this.manager.nodes[source_item] = new ItemWrapper(this.manager, this.wrapper, source_item);
        this.source = this.manager.nodes[source_item];
        return this;
    }

    setHuntable(animal_source) {
        this.type = 'hunt';
        this.source = animal_source;
        return this;
    }

    getChildren() {
        let children = [];
        for (let child of this.recipe) {
            if (child[0] instanceof ItemWrapper && child[0].methods.length > 0) {
                children.push(child);
            }
        }
        if (this.prereq && this.prereq instanceof ItemWrapper && this.prereq.methods.length > 0) {
            children.push([this.prereq, 1]);
        }
        return children;
    }

    isReady() {
        for (let [child, quantity] of this.getChildren()) {
            if (!child.isDone(quantity)) {
                return false;
            }
        }
        return true;
    }

    isDone(quantity=1) {
        let qualifying = [this.name];
        if (this.name.includes('pickaxe') || 
                this.name.includes('axe') || 
                this.name.includes('shovel') ||
                this.name.includes('hoe') ||
                this.name.includes('sword')) {
            let material = this.name.split('_')[0];
            let type = this.name.split('_')[1];
            if (material === 'wooden') {
                qualifying.push('stone_' + type);
                qualifying.push('iron_' + type);
                qualifying.push('gold_' + type);
                qualifying.push('diamond_' + type);
            } else if (material === 'stone') {
                qualifying.push('iron_' + type);
                qualifying.push('gold_' + type);
                qualifying.push('diamond_' + type);
            } else if (material === 'iron') {
                qualifying.push('gold_' + type);
                qualifying.push('diamond_' + type);
            } else if (material === 'gold') {
                qualifying.push('diamond_' + type);
            }
        }
        for (let item of qualifying) {
            if (world.getInventoryCounts(this.manager.agent.bot)[item] >= quantity) {
                return true;
            }
        }
        return false;
    }

    getDepth(quantity=1) {
        if (this.isDone(quantity)) {
            return 0;
        }
        let depth = 0;
        for (let [child, quantity] of this.getChildren()) {
            depth = Math.max(depth, child.getDepth(quantity));
        }
        return depth + 1;
    }

    getFails(quantity=1) {
        if (this.isDone(quantity)) {
            return 0;
        }
        let fails = 0;
        for (let [child, quantity] of this.getChildren()) {
            fails += child.getFails(quantity);
        }
        return fails + this.fails;
    }

    getNext() {
        if (this.isReady()) {
            return this;
        }
        let furthest_depth = -1;
        let furthest_child = null;
        for (let [child, quantity] of this.getChildren()) {
            let depth = child.getDepth();
            if (depth > furthest_depth) {
                furthest_depth = depth;
                furthest_child = child;
            }
        }
        return furthest_child.getNext();    
    }

    async execute() {
        if (!this.isReady()) {
            this.fails += 1;
            return;
        }
        let init_quantity = world.getInventoryCounts(this.manager.agent.bot)[this.name] || 0;
        if (this.type === 'block') {
            await skills.collectBlock(this.manager.agent.bot, this.source);
        } else if (this.type === 'smelt') {
            await skills.smeltItem(this.manager.agent.bot, this.name);
        } else if (this.type === 'hunt') {
            await skills.attackNearest(this.manager.agent.bot, this.source);
        } else if (this.type === 'craft') {
            await skills.craftRecipe(this.manager.agent.bot, this.name);
        }
        let final_quantity = world.getInventoryCounts(this.manager.agent.bot)[this.name] || 0;
        if (final_quantity <= init_quantity) {
            this.fails += 1;
        }
    }
}


class ItemWrapper {
    constructor(manager, parent, name) {
        this.manager = manager;
        this.name = name;
        this.parent = parent;
        this.methods = [];

        if (!this.containsCircularDependency()) {
            this.createChildren();
        }
    }

    createChildren() {
        let recipes = mc.getItemCraftingRecipes(this.name);
        if (recipes) {
            for (let recipe of recipes) {
                this.methods.push(new ItemNode(this.manager, this, this.name).setRecipe(recipe));
            }
        }

        let block_source = mc.getItemBlockSource(this.name);
        if (block_source) {
            let tool = mc.getBlockTool(block_source);
            this.methods.push(new ItemNode(this.manager, this, this.name).setCollectable(block_source, tool));
        }

        let smeltingIngredient = mc.getItemSmeltingIngredient(this.name);
        if (smeltingIngredient) {
            this.methods.push(new ItemNode(this.manager, this, this.name).setSmeltable(smeltingIngredient));
        }

        let animal_source = mc.getItemAnimalSource(this.name);
        if (animal_source) {
            this.methods.push(new ItemNode(this.manager, this, this.name).setHuntable(animal_source));
        }
    }

    containsCircularDependency() {
        let p = this.parent;
        while (p) {
            if (p.name === this.name) {
                return true;
            }
            p = p.parent;
        }
        return false;
    }

    getBestMethod() {
        let best_cost = -1;
        let best_method = null;
        for (let method of this.methods) {
            let cost = method.getDepth() + method.getFails();
            if (best_cost == -1 || cost < best_cost) {
                best_cost = cost;
                best_method = method;
            }
        }
        return best_method
    }

    getChildren() {
        if (this.methods.length === 0)
            return [];
        return this.getBestMethod().getChildren();
    }

    isReady() {
        if (this.methods.length === 0)
            return false;
        return this.getBestMethod().isReady();
    }

    isDone(quantity=1) {
        if (this.methods.length === 0)
            return true;
        return this.getBestMethod().isDone(quantity);
    }

    getDepth() {
        if (this.methods.length === 0)
            return 0;
        return this.getBestMethod().getDepth();
    }

    getFails() {
        if (this.methods.length === 0)
            return 0;
        return this.getBestMethod().getFails();
    }

    getNext() {
        if (this.methods.length === 0)
            return null;
        return this.getBestMethod().getNext();
    }
}


export class ItemGoal {
    constructor(agent, timeout=-1) {
        this.agent = agent;
        this.timeout = timeout;
        this.goal = null;
        this.quantity = 1;
        this.nodes = {};
    }

    setGoal(goal, quantity=1) {
        this.quantity = quantity;
        if (this.nodes[goal] === undefined)
            this.nodes[goal] = new ItemWrapper(this, null, goal);
        this.goal = this.nodes[goal];
    }

    async executeNext() {
        let next = this.goal.getNext();
        // Prevent unnecessary attempts to obtain blocks that are not nearby
        if (next.type === 'block' && !world.getNearbyBlockTypes(this.agent.bot).includes(next.source)) {
            next.fails += 1;
            await new Promise((resolve) => setTimeout(resolve, 500));
            this.agent.bot.emit('idle');
            return;
        }

        let init_quantity = world.getInventoryCounts(this.agent.bot)[next.name] || 0;
        await this.agent.coder.execute(async () => {
            await next.execute();
        }, this.timeout);
        let final_quantity = world.getInventoryCounts(this.agent.bot)[next.name] || 0;

        if (final_quantity > init_quantity) {
            console.log(`Successfully obtained ${next.name} for goal ${this.goal.name}`);
        } else {
            console.log(`Failed to obtain ${next.name} for goal ${this.goal.name}`);
        }
    }
}
