
export class BlueprintGenerator {
    constructor(num_levels, 
                num_rooms, 
                room_height, 
                materials) {
        this.blueprint = {
            "name": "Blueprint",
            "nodes": [],
            "connections": []
        };
    }

    addNode(node) {
        this.blueprint.nodes.push(node);
    }

    addConnection(connection) {
        this.blueprint.connections.push(connection);
    }

    getBlueprint() {
        return this.blueprint;
    }
}