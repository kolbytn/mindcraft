export class NPCData {
    constructor() {
        this.goals = [];
    }

    toObject() {
        return {
            goals: this.goals
        }
    }

    static fromObject(obj) {
        if (!obj) return null;
        let npc = new NPCData();
        npc.goals = obj.goals;
        return npc;
    }
}