export class NPCData {
    constructor() {
        this.goals = [];
        this.built = {};
        this.home = null;
    }

    toObject() {
        let obj = {};
        if (this.goals.length > 0)
            obj.goals = this.goals;
        if (Object.keys(this.built).length > 0)
            obj.built = this.built;
        if (this.home)
            obj.home = this.home;
        return obj;
    }

    static fromObject(obj) {
        if (!obj) return null;
        let npc = new NPCData();
        if (obj.goals) {
            npc.goals = [];
            for (let goal of obj.goals) {
                if (typeof goal === 'string')
                    npc.goals.push({name: goal, quantity: 1});
                else
                    npc.goals.push({name: goal.name, quantity: goal.quantity});
            }
        }
        if (obj.built)
            npc.built = obj.built;
        if (obj.home)
            npc.home = obj.home;
        return npc;
    }
}