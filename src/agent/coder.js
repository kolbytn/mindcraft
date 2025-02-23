import { writeFile, readFile, mkdirSync } from 'fs';
import settings from '../../settings.js';
import { makeCompartment } from './library/lockdown.js';
import * as skills from './library/skills.js';
import * as world from './library/world.js';
import { Vec3 } from 'vec3';
import {ESLint} from "eslint";

export class Coder {
    constructor(agent) {
        this.agent = agent;
        this.file_counter = 0;
        this.fp = '/bots/'+agent.name+'/action-code/';
        this.generating = false;
        this.code_template = '';
        this.code_lint_template = '';

        readFile('./bots/execTemplate.js', 'utf8', (err, data) => {
            if (err) throw err;
            this.code_template = data;
        });
        readFile('./bots/lintTemplate.js', 'utf8', (err, data) => {
            if (err) throw err;
            this.code_lint_template = data;
        });
        mkdirSync('.' + this.fp, { recursive: true });
    }
    
    async  lintCode(code) {
        let result = '#### CODE ERROR INFO ###\n';
        // Extract everything in the code between the beginning of 'skills./world.' and the '('
        const skillRegex = /(?:skills|world)\.(.*?)\(/g;
        const skills = [];
        let match;
        while ((match = skillRegex.exec(code)) !== null) {
            skills.push(match[1]);
        }
        const allDocs = await this.agent.prompter.skill_libary.getAllSkillDocs();
        // check function exists
        const missingSkills = skills.filter(skill => !!allDocs[skill]);
        if (missingSkills.length > 0) {
            result += 'These functions do not exist. Please modify the correct function name and try again.\n';
            result += '### FUNCTIONS NOT FOUND ###\n';
            result += missingSkills.join('\n');
            console.log(result)
            return result;
        }

        const eslint = new ESLint();
        const results = await eslint.lintText(code);
        const codeLines = code.split('\n');
        const exceptions = results.map(r => r.messages).flat();

        if (exceptions.length > 0) {
            exceptions.forEach((exc, index) => {
                if (exc.line && exc.column ) {
                    const errorLine = codeLines[exc.line - 1]?.trim() || 'Unable to retrieve error line content';
                    result += `#ERROR ${index + 1}\n`;
                    result += `Message: ${exc.message}\n`;
                    result += `Location: Line ${exc.line}, Column ${exc.column}\n`;
                    result += `Related Code Line: ${errorLine}\n`;
                }
            });
            result += 'The code contains exceptions and cannot continue execution.';
        } else {
            return null;//no error
        }

        return result ;
    }
    // write custom code to file and import it
    // write custom code to file and prepare for evaluation
    async stageCode(code) {
        code = this.sanitizeCode(code);
        let src = '';
        code = code.replaceAll('console.log(', 'log(bot,');
        code = code.replaceAll('log("', 'log(bot,"');

        console.log(`Generated code: """${code}"""`);

        // this may cause problems in callback functions
        code = code.replaceAll(';\n', '; if(bot.interrupt_code) {log(bot, "Code interrupted.");return;}\n');
        for (let line of code.split('\n')) {
            src += `    ${line}\n`;
        }
        let src_lint_copy = this.code_lint_template.replace('/* CODE HERE */', src);
        src = this.code_template.replace('/* CODE HERE */', src);

        let filename = this.file_counter + '.js';
        // if (this.file_counter > 0) {
        //     let prev_filename = this.fp + (this.file_counter-1) + '.js';
        //     unlink(prev_filename, (err) => {
        //         console.log("deleted file " + prev_filename);
        //         if (err) console.error(err);
        //     });
        // } commented for now, useful to keep files for debugging
        this.file_counter++;
        
        let write_result = await this.writeFilePromise('.' + this.fp + filename, src);
        // This is where we determine the environment the agent's code should be exposed to.
        // It will only have access to these things, (in addition to basic javascript objects like Array, Object, etc.)
        // Note that the code may be able to modify the exposed objects.
        const compartment = makeCompartment({
            skills,
            log: skills.log,
            world,
            Vec3,
        });
        const mainFn = compartment.evaluate(src);
        
        if (write_result) {
            console.error('Error writing code execution file: ' + result);
            return null;
        }
        return { func:{main: mainFn}, src_lint_copy: src_lint_copy };
    }

    sanitizeCode(code) {
        code = code.trim();
        const remove_strs = ['Javascript', 'javascript', 'js']
        for (let r of remove_strs) {
            if (code.startsWith(r)) {
                code = code.slice(r.length);
                return code;
            }
        }
        return code;
    }

    writeFilePromise(filename, src) {
        // makes it so we can await this function
        return new Promise((resolve, reject) => {
            writeFile(filename, src, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    async generateCode(agent_history) {
        // wrapper to prevent overlapping code generation loops
        await this.agent.actions.stop();
        this.generating = true;
        let res = await this.generateCodeLoop(agent_history);
        this.generating = false;
        if (!res.interrupted) this.agent.bot.emit('idle');
        return res.message;
    }

    async generateCodeLoop(agent_history) {
        this.agent.bot.modes.pause('unstuck');

        let messages = agent_history.getHistory();
        messages.push({role: 'system', content: 'Code generation started. Write code in codeblock in your response:'});

        let code = null;
        let code_return = null;
        let failures = 0;
        const interrupt_return = {success: true, message: null, interrupted: true, timedout: false};
        for (let i=0; i<5; i++) {
            if (this.agent.bot.interrupt_code)
                return interrupt_return;
            let res = await this.agent.prompter.promptCoding(JSON.parse(JSON.stringify(messages)));
            if (this.agent.bot.interrupt_code)
                return interrupt_return;
            let contains_code = res.indexOf('```') !== -1;
            if (!contains_code) {
                if (res.indexOf('!newAction') !== -1) {
                    messages.push({
                        role: 'assistant', 
                        content: res.substring(0, res.indexOf('!newAction'))
                    });
                    continue; // using newaction will continue the loop
                }
                
                if (failures >= 3) {
                    return { success: false, message: 'Action failed, agent would not write code.', interrupted: false, timedout: false };
                }
                messages.push({
                    role: 'system', 
                    content: 'Error: no code provided. Write code in codeblock in your response. ``` // example ```'}
                );
                failures++;
                continue;
            }
            code = res.substring(res.indexOf('```')+3, res.lastIndexOf('```'));
            const result = await this.stageCode(code);
            const executionModuleExports = result.func;
            let src_lint_copy = result.src_lint_copy;
            const analysisResult = await this.lintCode(src_lint_copy);
            if (analysisResult) {
                const message = 'Error: Code syntax error. Please try again:'+'\n'+analysisResult+'\n';
                messages.push({ role: 'system', content: message });
                continue;
            }
            if (!executionModuleExports) {
                agent_history.add('system', 'Failed to stage code, something is wrong.');
                return {success: false, message: null, interrupted: false, timedout: false};
            }
            
            code_return = await this.agent.actions.runAction('newAction', async () => {
                return await executionModuleExports.main(this.agent.bot);
            }, { timeout: settings.code_timeout_mins });
            if (code_return.interrupted && !code_return.timedout)
                return { success: false, message: null, interrupted: true, timedout: false };
            console.log("Code generation result:", code_return.success, code_return.message.toString());

            if (code_return.success) {
                const summary = "Summary of newAction\nAgent wrote this code: \n```" + this.sanitizeCode(code) + "```\nCode Output:\n" + code_return.message.toString();
                return { success: true, message: summary, interrupted: false, timedout: false };
            }

            messages.push({
                role: 'assistant',
                content: res
            });
            messages.push({
                role: 'system',
                content: code_return.message + '\nCode failed. Please try again:'
            });
        }
        return { success: false, message: null, interrupted: false, timedout: true };
    }
}