import * as skills from '../library/skills.js';
import * as world from '../library/world.js';
import * as mc from '../../utils/mcdata.js';


const blacklist = [
    'coal_block',
    'iron_block',
    'gold_block',
    'diamond_block',
    'deepslate',
    'blackstone',
    'netherite',
    '_wood',
    'stripped_',
    'crimson',
    'warped'
]


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
        this.recipe = [];
        for (let [key, value] of Object.entries(recipe)) {
            if (this.manager.nodes[key] === undefined)
                this.manager.nodes[key] = new ItemWrapper(this.manager, this.wrapper, key);
            this.recipe.push({node: this.manager.nodes[key], quantity: value});
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
        if (this.manager.nodes['coal'] === undefined)
            this.manager.nodes['coal'] = new ItemWrapper(this.manager, this.wrapper, 'coal');
        this.recipe = [
            {node: this.manager.nodes[source_item], quantity: 1},
            {node: this.manager.nodes['coal'], quantity: 1}
        ];
        return this;
    }

    setHuntable(animal_source) {
        this.type = 'hunt';
        this.source = animal_source;
        return this;
    }

    getChildren() {
        let children = [...this.recipe];
        if (this.prereq) {
            children.push({node: this.prereq, quantity: 1});
        }
        return children;
    }

    isReady() {
        for (let child of this.getChildren()) {
            if (!child.node.isDone(child.quantity)) {
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

    getDepth(q=1) {
        if (this.isDone(q)) {
            return 0;
        }
        let depth = 0;
        for (let child of this.getChildren()) {
            depth = Math.max(depth, child.node.getDepth(child.quantity));
        }
        return depth + 1;
    }

    getFails(q=1) {
        if (this.isDone(q)) {
            return 0;
        }
        let fails = 0;
        for (let child of this.getChildren()) {
            fails += child.node.getFails(child.quantity);
        }
        return fails + this.fails;
    }

    getNext(q=1) {
        if (this.isDone(q))
            return null;
        if (this.isReady())
            return {node: this, quantity: q};
        for (let child of this.getChildren()) {
            let res = child.node.getNext(child.quantity);
            if (res)
                return res;
        }
        return null;
    }

    async execute(quantity=1) {
        if (!this.isReady()) {
            this.fails += 1;
            return;
        }
        let inventory = world.getInventoryCounts(this.manager.agent.bot);
        let init_quantity = inventory[this.name] || 0;
        if (this.type === 'block') {
            await skills.collectBlock(this.manager.agent.bot, this.source, quantity);
        } else if (this.type === 'smelt') {
            let to_smelt_name = this.recipe[0].node.name;
            let to_smelt_quantity = Math.min(quantity, inventory[to_smelt_name] || 1);
            await skills.smeltItem(this.manager.agent.bot, to_smelt_name, to_smelt_quantity);
        } else if (this.type === 'hunt') {
            for (let i=0; i<quantity; i++) {
                res = await skills.attackNearest(this.manager.agent.bot, this.source);
                if (!res)
                    break;
            }
        } else if (this.type === 'craft') {
            await skills.craftRecipe(this.manager.agent.bot, this.name, quantity);
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

        let blacklisted = false;
        for (let match of blacklist) {
            if (name.includes(match)) {
                blacklisted = true;
                break;
            }
        }

        if (!blacklisted && !this.containsCircularDependency()) {
            this.createChildren();
        }
    }

    add_method(method) {
        for (let child of method.getChildren()) {
            if (child.node.methods.length === 0)
                return;
        }
        this.methods.push(method);
    }

    createChildren() {
        let recipes = mc.getItemCraftingRecipes(this.name);
        if (recipes) {
            for (let recipe of recipes) {
                this.add_method(new ItemNode(this.manager, this, this.name).setRecipe(recipe))
            }
        }

        let block_source = mc.getItemBlockSource(this.name);
        if (block_source) {
            let tool = mc.getBlockTool(block_source);
            this.add_method(new ItemNode(this.manager, this, this.name).setCollectable(block_source, tool));
        }

        let smeltingIngredient = mc.getItemSmeltingIngredient(this.name);
        if (smeltingIngredient) {
            this.add_method(new ItemNode(this.manager, this, this.name).setSmeltable(smeltingIngredient));
        }

        let animal_source = mc.getItemAnimalSource(this.name);
        if (animal_source) {
            this.add_method(new ItemNode(this.manager, this, this.name).setHuntable(animal_source));
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

    getBestMethod(q=1) {
        let best_cost = -1;
        let best_method = null;
        for (let method of this.methods) {
            let cost = method.getDepth(q) + method.getFails(q);
            if (best_cost == -1 || cost < best_cost) {
                best_cost = cost;
                best_method = method;
            }
        }
        return best_method
    }

    isDone(q=1) {
        if (this.methods.length === 0)
            return false;
        return this.getBestMethod(q).isDone(q);
    }

    getDepth(q=1) {
        if (this.methods.length === 0)
            return 0;
        return this.getBestMethod(q).getDepth(q);
    }

    getFails(q=1) {
        if (this.methods.length === 0)
            return 0;
        return this.getBestMethod(q).getFails(q);
    }

    getNext(q=1) {
        if (this.methods.length === 0)
            return null;
        return this.getBestMethod(q).getNext(q);
    }
}


export class ItemGoal {
    constructor(agent, timeout=-1) {
        this.agent = agent;
        this.timeout = timeout;
        this.goals = [];
        this.nodes = {};
        this.failed = [];
    }

    setGoals(goals) {
        this.goals = []
        for (let goal of goals) {
            this.goals.push({name: goal, quantity: 1})
        }
    }

    async executeNext() {
        // Get goal by priority
        let goal = null;
        for (let g of this.goals) {
            if (this.nodes[g.name] === undefined)
                this.nodes[g.name] = new ItemWrapper(this, null, g.name);
            if (!this.nodes[g.name].isDone(g.quantity)) {
                goal = this.nodes[g.name];
                break;
            }
        }
        if (goal === null)
            return;

        // Get next goal to execute
        let next_info = goal.getNext();
        let next = next_info.node;
        let quantity = next_info.quantity;

        // Prevent unnecessary attempts to obtain blocks that are not nearby
        if (next.type === 'block' && !world.getNearbyBlockTypes(this.agent.bot).includes(next.source) ||
                next.type === 'hunt' && !world.getNearbyEntityTypes(this.agent.bot).includes(next.source)) {
            next.fails += 1;

            // If the bot has failed to obtain the block before, explore
            if (this.failed.includes(next.name)) {
                this.failed = this.failed.filter((item) => item !== next.name);
                this.agent.coder.interruptible = true;
                await this.agent.coder.execute(async () => {
                    await skills.moveAway(this.agent.bot, 8);
                }, this.timeout);
                this.agent.coder.interruptible = false;
            } else {
                this.failed.push(next.name);
                await new Promise((resolve) => setTimeout(resolve, 500));
                this.agent.bot.emit('idle');
            }
            return;
        }

        // Wait for the bot to be idle before attempting to execute the next goal
        if (!this.agent.isIdle())
            return;

        // Execute the next goal
        let init_quantity = world.getInventoryCounts(this.agent.bot)[next.name] || 0;
        this.agent.coder.interruptible = true;
        await this.agent.coder.execute(async () => {
            await next.execute(quantity);
        }, this.timeout);
        this.agent.coder.interruptible = false;
        let final_quantity = world.getInventoryCounts(this.agent.bot)[next.name] || 0;

        // Log the result of the goal attempt
        if (final_quantity > init_quantity) {
            console.log(`Successfully obtained ${next.name} for goal ${goal.name}`);
        } else {
            console.log(`Failed to obtain ${next.name} for goal ${goal.name}`);
        }
    }
}
