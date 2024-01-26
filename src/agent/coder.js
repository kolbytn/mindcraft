import { writeFile, readFile, mkdirSync } from 'fs';
import { sendRequest } from '../utils/gpt.js';
import { getSkillDocs } from './library/index.js';
import { Examples } from '../utils/examples.js';


export class Coder {
    constructor(agent) {
        this.agent = agent;
        this.file_counter = 0;
        this.fp = '/bots/'+agent.name+'/action-code/';
        this.executing = false;
        this.code_template = '';
        this.timedout = false;
    }

    async load() {
        this.examples = new Examples();
        await this.examples.load('./src/examples_coder.json');

        readFile('./bots/template.js', 'utf8', (err, data) => {
            if (err) throw err;
            this.code_template = data;
        });

        mkdirSync('.' + this.fp, { recursive: true });
    }

    // write custom code to file and import it
    async stageCode(code) {
        code = this.santitizeCode(code);
        let src = '';
        code = code.replaceAll('console.log(', 'log(bot,');
        code = code.replaceAll('log("', 'log(bot,"');

        // this may cause problems in callback functions
        code = code.replaceAll(';\n', '; if(bot.interrupt_code) {log(bot, "Code interrupted.");return;}\n');
        for (let line of code.split('\n')) {
            src += `    ${line}\n`;
        }
        src = this.code_template.replace('/* CODE HERE */', src);

        console.log("writing to file...", src)

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

    santitizeCode(code) {
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
        let system_message = "You are a minecraft mineflayer bot that plays minecraft by writing javascript codeblocks. Given the conversation between you and the user, use the provided skills and world functions to write your code in a codeblock. Example response: ``` // your code here ``` You will then be given a response to your code. If you are satisfied with the response, respond without a codeblock in a conversational way. If something went wrong, write another codeblock and try to fix the problem.";
        system_message += getSkillDocs();

        system_message += "\n\nExamples:\nUser zZZn98: come here \nAssistant: I am going to navigate to zZZn98. ```\nawait skills.goToPlayer(bot, 'zZZn98');```\nSystem: Code execution finished successfully.\nAssistant: Done.";

        let messages = await agent_history.getHistory(this.examples);

        let code_return = null;
        let failures = 0;
        for (let i=0; i<5; i++) {
            if (this.agent.bot.interrupt_code)
                return;
            console.log(messages)
            let res = await sendRequest(messages, system_message);
            console.log('Code generation response:', res)
            let contains_code = res.indexOf('```') !== -1;
            if (!contains_code) {
                if (code_return) {
                    agent_history.add('system', code_return.message);
                    agent_history.add(this.agent.name, res);
                    this.agent.bot.chat(res);
                    return;
                }
                if (failures >= 1) {
                    agent_history.add('system', 'Action failed, agent would not write code.');
                    return;
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
                return;
            }
            code_return = await this.execute(async ()=>{
                return await execution_file.main(this.agent.bot);
            });

            if (code_return.interrupted && !code_return.timedout)
                return;
            console.log(code_return.message);

            messages.push({
                role: 'assistant',
                content: res
            });
            messages.push({
                role: 'system',
                content: code_return.message
            });
        }
        return;
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
            return {success:true, message: output, interrupted, timedout};
        } catch (err) {
            this.executing = false;
            clearTimeout(TIMEOUT);

            console.error("Code execution triggered catch: " + err);
            await this.stop();

            let message = this.formatOutput(this.agent.bot) + '!!Code threw exception!!  Error: ' + err;
            let interrupted = this.agent.bot.interrupt_code;
            this.clear();
            return {success: false, message, interrupted, timedout: false};
        }
    }

    formatOutput(bot) {
        if (bot.interrupt_code && !this.timedout) return '';
        let output = bot.output;
        const MAX_OUT = 1000;
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
        while (this.executing) {
            this.agent.bot.interrupt_code = true;
            this.agent.bot.collectBlock.cancelTask();
            this.agent.bot.pathfinder.stop();
            this.agent.bot.pvp.stop();
            console.log('waiting for code to finish executing... interrupt:', this.agent.bot.interrupt_code);
            await new Promise(resolve => setTimeout(resolve, 1000));
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
            this.agent.bot.output += `\nAction performed for ${TIMEOUT_MINS} minutes and then timed out and stopped. You may want to continue or do something else.`;
            this.stop(); // last attempt to stop
            await new Promise(resolve => setTimeout(resolve, 5 * 1000)); // wait 5 seconds
            if (this.executing) {
                console.error(`Failed to stop. Killing process. Goodbye.`);
                this.agent.bot.output += `\nForce stop failed! Process was killed and will be restarted. Goodbye world.`;
                this.agent.bot.chat('Goodbye world.');
                let output = this.formatOutput(this.agent.bot);
                this.agent.history.add('system', output);
                this.agent.history.save();
                process.exit(1); // force exit program
            }
            console.log('Code execution stopped successfully.');
        }, TIMEOUT_MINS*60*1000);
    }
}