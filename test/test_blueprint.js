import { Blueprint } from '../src/agent/tasks.js';
import { readFileSync } from 'fs';

//load file from example_tasks.json
const object = JSON.parse(readFileSync('example_tasks.json', 'utf8'));
console.log(object.construction_house.blueprint);
const blueprint = new Blueprint(object.construction_house.blueprint);
const placement = object.construction_house.blueprint.levels[0].placement;
console.log(placement);
var placement_string = "[\n";
for (let row of placement) {
    placement_string += "[";
    for (let i = 0; i < row.length - 1; i++) {
        let item = row[i];
        placement_string += `${item}, `;
    }
    let final_item = row[row.length - 1];
    placement_string += `${final_item}],\n`;
}
placement_string += "]";
console.log(placement_string);
console.log(blueprint.explain());