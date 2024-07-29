import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';


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
async function dynamicLoadModule(modulePath) {
    const moduleURL = pathToFileURL(modulePath).href;
    return import(moduleURL + '?t=' + Date.now());
}

export async function getSkillDocs() {
    // 获取当前文件的路径
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.log(__dirname); // /Users/username/Projects/agent/src/agent/library
    console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    // 计算相对于当前文件的 ./skills.js 和 ./world.js 文件路径
    const skillsPath = path.resolve(__dirname, './skills.js');
    const worldPath = path.resolve(__dirname, './world.js');

    const [skills, world] = await Promise.all([
        dynamicLoadModule(skillsPath),
        dynamicLoadModule(worldPath)
    ]);

    let docstring = "\n*SKILL DOCS\nThese skills are JavaScript functions that can be called when writing actions and skills.\n";
    docstring += await docHelper(Object.values(skills), 'skills');
    docstring += await docHelper(Object.values(world), 'world');
    return docstring + '*\n';
}

