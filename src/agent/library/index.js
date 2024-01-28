import * as skills from './skills.js';
import * as world from './world.js';


export function docHelper(functions, module_name) {
    let docstring = '';
    for (let skillFunc of functions) {
        let str = skillFunc.toString();
        if (str.includes('/**')){
            docstring += module_name+'.'+skillFunc.name;
            docstring += str.substring(str.indexOf('/**')+3, str.indexOf('**/')) + '\n';
        }
    }
    return docstring;
}

export function getSkillDocs() {
    let docstring = "\n*SKILL DOCS\nThese skills are javascript functions that can be called when writing actions and skills.\n";
    docstring += docHelper(Object.values(skills), 'skills');
    docstring += docHelper(Object.values(world), 'world');
    return docstring + '*\n';
}
