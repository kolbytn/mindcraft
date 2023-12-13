import * as skills from './skills.js';
import * as world from './world.js';

export function getSkillDocs() {
    let docstring = "\n*SKILL DOCS\nThese skills are javascript functions that can be called with a js function by writing a code block. Ex: '```// write description comment and code here```' \nYour code block should return a bool indicating if the task was completed successfully. It will return true if you don't write a return statement.\n";
    docstring += docHelper(Object.values(skills), 'skills');
    docstring += docHelper(Object.values(world), 'world');
    return docstring + '*\n';
}

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

export function containsCodeBlock(message) {
    return message.indexOf('```') !== -1;
}
