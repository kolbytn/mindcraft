import * as skills from './skills.js';
import * as world from './world.js';

export function getSkillDocs() {
    let docstring = "\n*SKILL DOCS\nThese skills are javascript functions that can be called with a js function by writing a code block. Ex: '```// write description comment and code here```' \n\
                        Your code block should return a bool indicating if the task was completed successfully. It will return true if you don't write a return statement.\n";
    for (let skillFunc of Object.values(world).concat(Object.values(skills))) {
        let str = skillFunc.toString();
        if (str.includes('/**')){
            docstring += skillFunc.name;
            docstring += str.substring(str.indexOf('/**')+3, str.indexOf('**/')) + '\n';
        }
    }
    return docstring + '*\n';
}

export function containsCodeBlock(message) {
    return message.indexOf('```') !== -1;
}
