import mineflayer from 'mineflayer';
import { Vec3 } from 'vec3';
import { ConstructionTaskValidator, Blueprint, checkBlueprint, checkLevelBlueprint } from '../src/agent/tasks.js';
import { Agent } from '../src/agent/agent.js';

try {
    const agent = new Agent("../andy.json", 
                        false,
                        null, 
                        0, 
                        "../example_tasks.json", 
                        "construction_house");
    await new Promise((resolve) => setTimeout(resolve, 10000));
    let result = await checkBlueprint(agent);
    // console.log(result);
    // const levelResult = await checkLevelBlueprint(agent, 0);
    // console.log(levelResult);
} catch (error) {
    console.error('An error occurred:', error);
    process.exit(1);
}




// const validator = new ConstructionTaskValidator();

const blueprintData = {
    "materials": {
        "oak_planks": 20, 
        "oak_door": 1,
        "stone": 26,
    },
    "levels": [
        {
            "level": 0,
            "coordinates": [142, -60, -179],
            "placement":
            [
                ["stone", "stone", "oak_door", "stone", "stone"],
                ["stone", "air", "air", "air", "stone"],
                ["stone", "air", "air", "air", "stone"],
                ["stone", "stone", "stone", "stone", "stone"]
            ]
        },
        {
            "level": 1,
            "coordinates": [142, -59, -179],
            "placement":
            [
                ["stone", "stone", "oak_door", "stone", "stone"],
                ["stone", "air", "air", "air", "stone"],
                ["stone", "air", "air", "air", "stone"],
                ["stone", "stone", "stone", "stone", "stone"]
            ]
        },
        {
            "level": 2,
            "coordinates": [142, -58, -179],
            "placement":
            [
                ["oak_planks", "oak_planks", "oak_planks", "oak_planks", "oak_planks"],
                ["oak_planks", "oak_planks", "oak_planks", "oak_planks", "oak_planks"],
                ["oak_planks", "oak_planks", "oak_planks", "oak_planks", "oak_planks"],
                ["oak_planks", "oak_planks", "oak_planks", "oak_planks", "oak_planks"]
            ]
        }
    ]
};