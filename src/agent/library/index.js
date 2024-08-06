import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';


export function docHelper(functions, module_name) {
    let docList = [];
    for (let skillFunc of functions) {
        let str = skillFunc.toString();
        if (str.includes('/**')) {
            // 提取整个注释块
            let docBlock = str.substring(str.indexOf('/**') + 3, str.indexOf('**/')).trim();
            // 使用正则表达式提取@description后面的文本
            let descriptionMatch = docBlock.match(/@description\s+([^\r\n]+)/);
            if (descriptionMatch) {
                let descriptionText = docBlock ;//descriptionMatch[1].trim();
                // 将模块名和描述文本添加到docList
                let moduleDoc = [
                    module_name + '.' + skillFunc.name,
                    descriptionText
                ];
                docList.push(moduleDoc);
            }
        }
    }
    return docList;
}



async function dynamicLoadModule(modulePath) {
    const moduleURL = pathToFileURL(modulePath).href;
    return import(moduleURL + '?t=' + Date.now());
}

export async function getSkillDocs() {
    // 获取当前文件的路径
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    // 计算相对于当前文件的 ./skills.js 和 ./world.js 文件路径
    const skillsPath = path.resolve(__dirname, './skills.js');
    const worldPath = path.resolve(__dirname, './world.js');

    const [skills, world] = await Promise.all([
        dynamicLoadModule(skillsPath),
        dynamicLoadModule(worldPath)
    ]);

    // let docstring = "\n*SKILL DOCS\nThese skills are JavaScript functions that can be called when writing actions and skills.\n";
    // let skillLevelDocs = 'Skill Level:basic、intermediate、advanced and expert\n';
    // docstring += skillLevelDocs;
    const skillDocs = await docHelper(Object.values(skills), 'skills');
    const worldDocs  = await docHelper(Object.values(world), 'world');
    return [].concat(skillDocs, worldDocs);
}

