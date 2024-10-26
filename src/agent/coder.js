import { writeFile, readFile, mkdirSync } from 'fs';
import { checkSafe } from '../utils/safety.js';
import settings from '../../settings.js';

export class Coder {
    constructor(agent) {
        this.agent = agent;
        this.file_counter = 0;
        this.fp = '/bots/'+agent.name+'/action-code/';
        this.generating = false;
        this.code_template = '';

        readFile('./bots/template.js', 'utf8', (err, data) => {
            if (err) throw err;
            this.code_template = data;
        });

        mkdirSync('.' + this.fp, { recursive: true });
    }

    // write custom code to file and import it
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

        let write_result = await this.writeFilePromise('.' + this.fp + filename, src)
        
        if (write_result) {
            console.error('Error writing code execution file: ' + result);
            return null;
        }
        return await import('../..' + this.fp + filename);
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
        await this.agent.tasks.stop();
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
            console.log(messages)
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

            if (!checkSafe(code)) {
                console.warn(`Detected insecure generated code, not executing. Insecure code: \n\`${code}\``);
                const message = 'Error: Code insecurity detected. Do not import, read/write files, execute dynamic code, or access the internet. Please try again:';
                messages.push({ role: 'system', content: message });
                continue;
            }

            const executionModuleExports = await this.stageCode(code);
            if (!executionModuleExports) {
                agent_history.add('system', 'Failed to stage code, something is wrong.');
                return {success: false, message: null, interrupted: false, timedout: false};
            }
            
            code_return = await this.agent.tasks.runTask('newAction', async () => {
                return await executionModuleExports.main(this.agent.bot);
            }, { timeout: settings.code_timeout_mins });
            if (code_return.interrupted && !code_return.timedout)
                return { success: false, message: null, interrupted: true, timedout: false };
            console.log("Code generation result:", code_return.success, code_return.message);

            if (code_return.success) {
                const summary = "Summary of newAction\nAgent wrote this code: \n```" + this.sanitizeCode(code) + "```\nCode Output:\n" + code_return.message;
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