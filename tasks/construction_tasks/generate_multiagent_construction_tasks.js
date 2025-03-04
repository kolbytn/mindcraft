import fs from 'fs';
import {proceduralGeneration} from "../../src/agent/task_types/construction_tasks.js";

function createInitialInventory(blueprint, agents) {
    /*
    params:
    - blueprint object
    - number of agents (for inventory initialization)

    logic of the function:
    - loop matrix
    - every time a new material is hit, put it in a different agents inventory
    -
     */


    const inventories = {};
    const materialCounts = {};
    let currentAgent = 0;

    // Initialize inventories
    for (let i = 0; i < agents; i++) {
        inventories[i] = {'diamond_pickaxe':1};
    }

    // Count materials in blueprint
    for (const level of blueprint.levels) {
        for (const row of level.placement) {
            for (const block of row) {
                if (block !== 'air') {
                    // Check if material contains 'door' or 'ladder' and convert appropriately
                    let materialKey = block;
                    if (block.includes('dark_oak_door')) {
                        materialKey = 'dark_oak_door';
                    } else if (block.includes('oak_door')) {
                        materialKey = 'oak_door';
                    } else if (block.includes('ladder')) {
                        materialKey = 'ladder';
                    }

                    materialCounts[materialKey] = (materialCounts[materialKey] || 0) + 1;
                }
            }
        }
    }

    // Distribute materials among agents
    for (const [material, count] of Object.entries(materialCounts)) {
        inventories[currentAgent][material] = count;
        currentAgent = (currentAgent + 1) % agents;
    }
    

    return inventories;
}

function calculateSpaceNeeded(rooms) {
    const baseSize = 10;
    const scaleFactor = Math.floor(rooms / 4) * 5;
    return baseSize + scaleFactor;
}

function generateConstructionTasks(variants) {
    const tasks = {};
    const materialLevels = 5;
    const roomCounts = [4, 6, 8];
    const windowStyles = [0, 1, 2];
    const carpetStyles = [0, 1, 2];
    const timeout = 600 // 10 min base?

    for (let m = 0; m < materialLevels; m++) {
        for (let r = 0; r < roomCounts.length; r++) {
            for (let w = 0; w < windowStyles.length; w++) {
                for (let c = 0; c < carpetStyles.length; c++) {
                    for (let variant = 0; variant < variants; variant++) {
                        const rooms = roomCounts[r];
                        const spaceSize = calculateSpaceNeeded(rooms);

                        const blueprint = proceduralGeneration(
                            spaceSize,
                            spaceSize,
                            spaceSize,
                            rooms,
                            4,
                            4,
                            4,
                            5,
                            "air",
                            carpetStyles[c],
                            windowStyles[w],
                            m + 1
                        );

                        const taskName = `materials_${m}_rooms_${r}_window_${w}_carpet_${c}_variant_${variant}`;

                        tasks[taskName] = {
                            type: "construction",
                            goal: "Make a house with the blueprint",
                            conversation: "Let's share materials and make a house with the blueprint",
                            agent_count: 2,
                            initial_inventory: createInitialInventory(blueprint, 2),
                            timeout: timeout+(300*r), // 5 minute per additional level of complexity
                            blueprint: blueprint,

                        };
                    }
                }
            }
        }
    }

    return tasks;
}

const tasks = generateConstructionTasks(1);
// Clear existing file content
fs.writeFileSync('./test_multiagent_construction_tasks.json', '');
// re-add
fs.writeFileSync(
    './test_multiagent_construction_tasks.json',
    JSON.stringify(tasks, null, 2)
);

console.log("Generated tasks saved to test_multiagent_construction_tasks.json");