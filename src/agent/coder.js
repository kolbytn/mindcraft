import { writeFile, readFile, rmSync, mkdirSync, copyFileSync, lstatSync, readdirSync, existsSync } from 'fs';
import settings from '../../settings.js';
import path from 'path';

export class Coder {
    constructor(agent) {
        this.agent = agent;
        this.file_counter = 0;
        this.fp = '/bots/'+agent.name+'/action-code/';
        this.executing = false;
        this.generating = false;
        this.code_template = '';
        this.timedout = false;
        this.new_func_code = ''; //生成的新代码


        readFile('./bots/template.js', 'utf8', (err, data) => {
            if (err) throw err;
            this.code_template = data;
        });

        mkdirSync('.' + this.fp, { recursive: true });
        // Copy the base file, and finally Boolean parameters control whether to replace the existing file.
        const targetLibraryPath = './bots/' + agent.name + '/library';
        this.copyFolderRecursiveSync('./src/agent/library', targetLibraryPath,false);
        // Copy the base file, and finally Boolean parameters control whether to replace the existing file.Replace-true.
        const targetUtilsPath = './bots/utils';
        this.copyFolderRecursiveSync('./src/utils', targetUtilsPath,true);

    }
    // Recursively copies the folder and its contents
    copyFolderRecursiveSync(source, target, shouldReplace) {
        // If shouldReplace is true, delete the target folder and its contents
        if (shouldReplace && existsSync(target)) {
            console.log('Deleting target folder:', target);
            rmSync(target, { recursive: true, force: true });
        }

        // Ensure the target path exists
        if (!existsSync(target)) {
            mkdirSync(target, { recursive: true });
        }

        // Read the contents of the source folder
        if (lstatSync(source).isDirectory()) {
            let files = readdirSync(source);
            files.forEach((file) => {
                let curSource = path.join(source, file);
                let curTarget = path.join(target, file);
                if (lstatSync(curSource).isDirectory()) {
                    // Recursively copy subfolders
                    copyFolderRecursiveSync(curSource, curTarget, false);
                } else {
                    // Copy the file to the target folder
                    copyFileSync(curSource, curTarget);
                }
            });
        }
    }

    // write custom code to file and import it
    async stageCode(code) {
        code = await this.sanitizeCode(code);
        let src = '';
        code = code.replaceAll('console.log(', 'log(bot,');
        code = code.replaceAll('log("', 'log(bot,"');

        console.log(`Generated code: """${code}"""`);

        // this may cause problems in callback functions
        code = code.replaceAll(';\n', '; if(bot.interrupt_code) {log(bot, "Code interrupted.");return;}\n');
        for (let line of code.split('\n')) {
            src += `    ${line}\n`;
        }

        //Copy src into the variable new fuc code
        const regex = /async function[\s\S]*/;
        let match = src.match(regex);
        if (match) {
            // 将匹配结果赋值给 new_func_code
            match = match[0];
        } else {
            console.error("The string 'async function' was not found.");
        }
        this.new_func_code = '\nexport '+match.trim();
        this.new_func_code = this.new_func_code.replace(/skills\./g, '');
        this.new_func_code = this.new_func_code.substring(0, this.new_func_code.lastIndexOf('\n'));

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

    async sanitizeCode(code) {
        for (let i = 0; i < 3; i++) { // MAX try 3 times
            code = code.trim();
            const remove_strs = ['Javascript', 'javascript', 'js']
            for (let r of remove_strs) {
                if (code.startsWith(r)) {
                    code = code.slice(r.length);
                }
            }
            //Check and correct comment blocks. Comment blocks should be inside the function and immediately below the function name.
            //If not, move the comment block to the correct position.
            //1. Check for the existence of comment blocks, which should be structured as /** ... **/
            const commentBlockRegex = /\/\*\*[^]*?\*\//;
            const commentBlockMatch = code.match(commentBlockRegex);
            const commentBlock = commentBlockMatch ? commentBlockMatch[0] : null;
            //2.1 if comment block exists, check if it is in the correct position
            if (commentBlock) {
                const functionNameRegex = /async\s+function\s+(\w+)\s*\(/;
                const functionNameMatch = code.match(functionNameRegex);
                const functionName = functionNameMatch ? functionNameMatch[1] : null;
                // Check if the comment block is in the correct position
                if (functionName && code.indexOf(commentBlock) >= 0 && code.indexOf(commentBlock) > code.indexOf(`async function ${functionName}`)) {
                    console.log('Comment block is in the correct position');
                } else {
                    console.log('Comment block exists, but not in the correct position');
                    // If the comment block is not in the correct position, move it to the correct position
                    if (functionName) {
                        code = code.replace(commentBlock, ''); // Remove existing comment block
                        const functionHeaderEndIndex = code.indexOf('{', code.indexOf(`async function ${functionName}`)) + 1;
                        code = code.slice(0, functionHeaderEndIndex) + '\n' + commentBlock + code.slice(functionHeaderEndIndex);
                    }
                }
                break
            } else {
                console.log('Comment block does not exist, add a comment block to the code...');
                //2.2 if comment block does not exist, add a comment block to the code
                let prompt = 'The generated code did not create comment sections according to my requirements. Please fix this issue. Adjust the generated code structure to conform to the following format,for example:\n' +
                    'async function goToBed(bot) {\n' +
                    '  /**\n' +
                    '   * @level basic\n' +
                    '   * @description Sleep in the nearest bed.\n' +
                    '   * @param {MinecraftBot} bot, reference to the Minecraft bot.\n' +
                    '   * @returns {Promise<boolean>} true if the bed was found, false otherwise.\n' +
                    '   * @example\n' +
                    '   * await skills.goToBed(bot);\n' +
                    '   **/\n' +
                    '  return true;\n' +
                    '}\n' +
                    'The code you need to adjust is as follows:\n' +
                    `${code}`; // The code that needs to be adjusted

                code = await this.agent.prompter.chat_model.sendRequest([], prompt);
                code = code.substring(code.indexOf('```')+3, code.lastIndexOf('```'));

            }
        }
        return code;
    }
    extractFunctionNameAndComments(code) {
        // Define regular expressions for extracting function name and comments
        const functionNameRegex = /export\s+async\s+function\s+(\w+)\s*\(/;
        const commentBlockRegex = /\/\*\*[^]*?\*\//;

        // Extract the function name
        const functionNameMatch = code.match(functionNameRegex);
        const functionName = functionNameMatch ? functionNameMatch[1] : null;

        // Extract the comment block
        const commentBlockMatch = code.match(commentBlockRegex);
        const commentBlock = commentBlockMatch ? commentBlockMatch[0] : null;

        return { functionName, commentBlock };
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
        await this.stop();
        this.generating = true;
        let res = await this.generateCodeLoop(agent_history);
        this.generating = false;
        if (!res.interrupted) this.agent.bot.emit('idle');
        return res.message;
    }

    async generateCodeLoop(agent_history) {
        let messages = agent_history.getHistory();
        messages.push({role: 'system', content: 'Code generation started. Write code in codeblock in your response:'});
        let code_return = null;
        let failures = 0;
        const interrupt_return = {success: true, message: null, interrupted: true, timedout: false};
        for (let i=0; i<5; i++) {
            if (this.agent.bot.interrupt_code)
                return interrupt_return;
            // console.log(messages)
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

                if (code_return) {
                    agent_history.add('system', code_return.message);
                    agent_history.add(this.agent.name, res);
                    this.agent.bot.chat(res);
                    //Write the new func code to the file
                    let targetPath = './bots/' + this.agent.name + '/library/skills.js';
                    //extract function name and comments
                    let { functionName, commentBlock } = this.extractFunctionNameAndComments(this.new_func_code);
                    //Extract all keys for this.agent.prompter.code_docs.embeddings
                    let existingFunctions = Object.keys(this.agent.prompter.code_docs.embeddings);
                    //write the new func code to the file
                    //Check that functionName is included in any element of an existing function
                    const isContained = existingFunctions.some(existingFunction => existingFunction.includes(functionName));
                    if (!isContained) {
                        // If functionName is not in an existing function, append new code
                        writeFile(targetPath, this.new_func_code, { flag: 'a' }, (err) => {
                            if (err) {
                                console.error('Failed to write code to file:', err);
                                return null;
                            }
                            // console.log(`${functionName} Successfully appended new function code to file.`);
                            // console.log(this.new_func_code)
                            // console.log(existingFunctions)
                        });
                        //update the embadded code
                        await this.agent.prompter.code_docs.addNewExample(['skills.'+functionName,commentBlock]);
                    } else {
                        console.log(`Function ${functionName} already exists. Skipping write.`);
                    }
                    return {success: true, message: null, interrupted: false, timedout: false};
                }
                if (failures >= 1) {
                    return {success: false, message: 'Action failed, agent would not write code.', interrupted: false, timedout: false};
                }
                messages.push({
                    role: 'system',
                    content: 'Error: no code provided. Write code in codeblock in your response. ``` // example ```'}
                );
                failures++;
                continue;
            }
            let code = res.substring(res.indexOf('```')+3, res.lastIndexOf('```'));
            const execution_file = await this.stageCode(code);


            if (!execution_file) {
                agent_history.add('system', 'Failed to stage code, something is wrong.');
                return {success: false, message: null, interrupted: false, timedout: false};
            }
            code_return = await this.execute(async ()=>{
                console.log("=====================================================")
                console.log(execution_file)
                return await execution_file.main(this.agent.bot);
            }, settings.code_timeout_mins);

            if (code_return.interrupted && !code_return.timedout)
                return {success: false, message: null, interrupted: true, timedout: false};
            console.log("Code generation result:", code_return.success, code_return.message);

            messages.push({
                role: 'assistant',
                content: res
            });
            messages.push({
                role: 'system',
                content: code_return.message
            });
        }
        return {success: false, message: null, interrupted: false, timedout: true};
    }

    async executeResume(func=null, name=null, timeout=10) {
        if (func != null) {
            this.resume_func = func;
            this.resume_name = name;
        }
        if (this.resume_func != null && this.agent.isIdle()) {
            console.log('resuming code...')
            this.interruptible = true;
            let res = await this.execute(this.resume_func, timeout);
            this.interruptible = false;
            return res;
        } else {
            return {success: false, message: null, interrupted: false, timedout: false};
        }
    }

    cancelResume() {
        this.resume_func = null;
        this.resume_name = null;
    }

    // returns {success: bool, message: string, interrupted: bool, timedout: false}
    async execute(func, timeout=10) {
        if (!this.code_template) return {success: false, message: "Code template not loaded.", interrupted: false, timedout: false};

        let TIMEOUT;
        try {
            console.log('executing code...\n');
            await this.stop();
            this.clear();

            this.executing = true;
            if (timeout > 0)
                TIMEOUT = this._startTimeout(timeout);
            await func(); // open fire
            this.executing = false;
            clearTimeout(TIMEOUT);

            let output = this.formatOutput(this.agent.bot);
            let interrupted = this.agent.bot.interrupt_code;
            let timedout = this.timedout;
            this.clear();
            if (!interrupted && !this.generating) this.agent.bot.emit('idle');
            // console.log('code execution failed|||||||||||||||||||||||||||||||||||||||');
            // console.log(this.new_func_code_relevent_docs)
            return {success:true, message: output, interrupted, timedout};
        } catch (err) {
            this.executing = false;
            clearTimeout(TIMEOUT);
            this.cancelResume();
            console.error("Code execution triggered catch: " + err);
            await this.stop();

            // console.log(this.new_func_code_relevent_docs)
            // 使用 err.stack 获取详细错误信息
            let detailedError = err.toString();//err.stack || err.toString();
            let errMessage = [{"role": "system", "content": detailedError}];
            let errReleventDocs = await this.agent.prompter.code_docs.getRelevantSkillDocs(errMessage,2);
            let message = this.formatOutput(this.agent.bot) +
                'Fix the code error in the last answer!!Code threw exception!! Error: ' +
                detailedError + '\n' +
                '1.Error repair reference, the correct usage is as follows\n' +
                errReleventDocs ;
            let interrupted = this.agent.bot.interrupt_code;
            this.clear();
            if (!interrupted && !this.generating) this.agent.bot.emit('idle');
            return {success: false, message, interrupted, timedout: false};
        }
    }

    formatOutput(bot) {
        if (bot.interrupt_code && !this.timedout) return '';
        let output = bot.output;
        const MAX_OUT = 500;
        if (output.length > MAX_OUT) {
            output = `Code output is very long (${output.length} chars) and has been shortened.\n
                First outputs:\n${output.substring(0, MAX_OUT/2)}\n...skipping many lines.\nFinal outputs:\n ${output.substring(output.length - MAX_OUT/2)}`;
        }
        else {
            output = 'Code output:\n' + output;
        }
        return output;
    }

    async stop() {
        if (!this.executing) return;
        const start = Date.now();
        while (this.executing) {
            this.agent.bot.interrupt_code = true;
            this.agent.bot.collectBlock.cancelTask();
            this.agent.bot.pathfinder.stop();
            this.agent.bot.pvp.stop();
            console.log('waiting for code to finish executing...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (Date.now() - start > 10 * 1000) {
                this.agent.cleanKill('Code execution refused stop after 10 seconds. Killing process.');
            }
        }
    }

    clear() {
        this.agent.bot.output = '';
        this.agent.bot.interrupt_code = false;
        this.timedout = false;
    }

    _startTimeout(TIMEOUT_MINS=10) {
        return setTimeout(async () => {
            console.warn(`Code execution timed out after ${TIMEOUT_MINS} minutes. Attempting force stop.`);
            this.timedout = true;
            this.agent.history.add('system', `Code execution timed out after ${TIMEOUT_MINS} minutes. Attempting force stop.`);
            await this.stop(); // last attempt to stop
        }, TIMEOUT_MINS*60*1000);
    }
}