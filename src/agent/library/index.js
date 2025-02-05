import * as skills from './skills.js';
import * as world from './world.js';


export function docHelper(functions, module_name) {
    let docArray = [];
    for (let skillFunc of functions) {
        let str = skillFunc.toString();
        if (str.includes('/**')) {
            let docEntry = `${module_name}.${skillFunc.name}\n`;
            docEntry += str.substring(str.indexOf('/**') + 3, str.indexOf('**/')).trim();
            docArray.push(docEntry);
        }
    }
    return docArray;
}

export function getSkillDocs() {
    let docArray = [];
    docArray = docArray.concat(docHelper(Object.values(skills), 'skills'));
    docArray = docArray.concat(docHelper(Object.values(world), 'world'));
    return docArray;
}
