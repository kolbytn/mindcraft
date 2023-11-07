import * as skills from './skills.js';
import { writeFile } from 'fs';

let skillDict = {};
for (let skill of Object.values(skills)) {
    skillDict[skill.name] = skill;
}

export function getSkillDocs() {
    let docstring = '\n*SKILL DOCS\nThese skills are javascript functions that can be called with a js function by writing a code block. Ex: "```// write description comment and code here```" \n';
    for (let skillFunc of Object.values(skills)) {
        let str = skillFunc.toString();
        docstring += skillFunc.name;
        docstring += str.substring(str.indexOf('/**')+3, str.indexOf('**/')) + '\n';
    }
    return docstring + '*\n';
}

export function containsCodeBlock(message) {
    console.log(message, message.indexOf('```'), message.indexOf('```') !== -1);
    return message.indexOf('```') !== -1;
}

export async function executeSkill(bot, code) {
    let src = "import * as skills from './utils/skills.js';";
    src += "\nimport * as world from './utils/world.js';"
    src += `\n\nexport async function main(bot) {\n`;
    for (let line of code.split('\n')) {
        src += `    ${line}\n`;
    }
    src += `}\n`;
    console.log(src)
    
    writeFile('./temp.js', src, (err) => {
        if (err) throw err;
    });

    try {
        let execution_file = await import('../temp.js');
        //log execution_file contents
        console.log(execution_file);
        await execution_file.main(bot);
        return true;
    } catch (err) {
        console.log(err);
        return false;
    }
}