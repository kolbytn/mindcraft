export class NPCData {
    constructor() {
        this.goals = [];
        this.built = {};
    }

    toObject() {
        return {
            goals: this.goals,
            built: this.built
        }
    }

    static fromObject(obj) {
        if (!obj) return null;
        let npc = new NPCData();
        if (obj.goals)
            npc.goals = obj.goals;
        if (obj.built)
            npc.built = obj.built;
        return npc;
    }
}