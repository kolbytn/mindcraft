import * as skills from './library/skills.js';
import * as world from './library/world.js';
import * as mc from '../utils/mcdata.js';


class ItemNode {
    constructor(bot, name, quantity, wrapper) {
        this.bot = bot;
        this.name = name;
        this.quantity = quantity;
        this.wrapper = wrapper;
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
            this.recipe.push(new ItemWrapper(this.bot, key, value * this.quantity, this.wrapper));
            size += value;
        }
        if (size > 4) {
            this.prereq = new ItemWrapper(this.bot, 'crafting_table', 1, this.wrapper);
        }
        return this;
    }

    setCollectable(source=null, tool=null) {
        this.type = 'block';
        if (source)
            this.source = source;
        else
            this.source = this.name;
        if (tool)
            this.prereq = new ItemWrapper(this.bot, tool, 1, this.wrapper);
        return this;
    }

    setSmeltable(source) {
        this.type = 'smelt';
        this.prereq = new ItemWrapper(this.bot, 'furnace', 1, this.wrapper);
        this.source = new ItemWrapper(this.bot, source, this.quantity, this.wrapper);
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
            if (child instanceof ItemWrapper && child.methods.length > 0) {
                children.push(child);
            }
        }
        if (this.prereq && this.prereq instanceof ItemWrapper && this.prereq.methods.length > 0) {
            children.push(this.prereq);
        }
        return children;
    }

    isReady() {
        for (let child of this.getChildren()) {
            if (!child.isDone()) {
                return false;
            }
        }
        return true;
    }

    isDone() {
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
            if (world.getInventoryCounts(this.bot)[item] >= this.quantity) {
                return true;
            }
        }
        return false;
    }

    getDepth() {
        if (this.isDone()) {
            return 0;
        }
        let depth = 0;
        for (let child of this.getChildren()) {
            depth = Math.max(depth, child.getDepth());
        }
        return depth + 1;
    }

    getFails() {
        if (this.isDone()) {
            return 0;
        }
        let fails = 0;
        for (let child of this.getChildren()) {
            fails += child.getFails();
        }
        return fails + this.fails;
    }

    getNext() {
        if (this.isReady()) {
            return this;
        }
        let furthest_depth = -1;
        let furthest_child = null;
        for (let child of this.getChildren()) {
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
        if (this.type === 'block') {
            await skills.collectBlock(this.bot, this.source, this.quantity);
        } else if (this.type === 'smelt') {
            await skills.smeltItem(this.bot, this.name, this.quantity);
        } else if (this.type === 'hunt') {
            for (let i = 0; i < this.quantity; i++) {
                let res = await skills.attackNearest(this.bot, this.source);
                if (!res) break;
            }
        } else if (this.type === 'craft') {
            await skills.craftRecipe(this.bot, this.name, this.quantity);
        }
        if (!this.isDone()) {
            this.fails += 1;
        }
    }
}


class ItemWrapper {
    constructor(bot, name, quantity, parent=null) {
        this.bot = bot;
        this.name = name;
        this.quantity = quantity;
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
                this.methods.push(new ItemNode(this.bot, this.name, this.quantity, this).setRecipe(recipe));
            }
        }

        let block_source = mc.getItemBlockSource(this.name);
        if (block_source) {
            let tool = mc.getBlockTool(block_source);
            this.methods.push(new ItemNode(this.bot, this.name, this.quantity, this).setCollectable(block_source, tool));
        }

        let smeltingIngredient = mc.getItemSmeltingIngredient(this.name);
        if (smeltingIngredient) {
            this.methods.push(new ItemNode(this.bot, this.name, this.quantity, this).setSmeltable(smeltingIngredient));
        }

        let animal_source = mc.getItemAnimalSource(this.name);
        if (animal_source) {
            this.methods.push(new ItemNode(this.bot, this.name, this.quantity, this).setHuntable(animal_source));
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

    isDone() {
        if (this.methods.length === 0)
            return true;
        return this.getBestMethod().isDone();
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
    }

    setGoal(goal, quantity=1) {
        this.goal = new ItemWrapper(this.agent.bot, goal, quantity);
    }

    async executeNext() {
        await new Promise(resolve => setTimeout(resolve, 500));
        let next = this.goal.getNext();

        await this.agent.coder.execute(async () => {
            await next.execute();
        }, this.timeout);

        if (next.isDone()) {
            console.log(`Successfully obtained ${next.quantity} ${next.name} for goal ${this.goal.name}`);
        } else {
            console.log(`Failed to obtain ${next.quantity} ${next.name} for goal ${this.goal.name}`);
        }
    }
}
