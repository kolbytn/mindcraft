import { writeFile, readFile, unlink } from 'fs';

export class Coder {
    constructor(agent) {
        this.agent = agent;
        this.queued_code = '';
        this.current_code = '';
        this.file_counter = 0;
        this.fp = './agent_code/';
        this.agent.bot.interrupt_code = false;
        this.executing = false;
        this.agent.bot.output = '';
        this.code_template = '';
        this.timedout = false;

        readFile(this.fp+'template.js', 'utf8', (err, data) => {
            if (err) throw err;
            this.code_template = data;
        });
    }

    queueCode(code) {
        this.queued_code = this.santitizeCode(code);
    }

    santitizeCode(code) {
        const remove_strs = ['javascript', 'js']
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


    // returns {success: bool, message: string, interrupted: bool, timedout: false}
    async execute() {
        if (!this.queued_code) return {success: false, message: "No code to execute.", interrupted: false, timedout: false};
        if (!this.code_template) return {success: false, message: "Code template not loaded.", interrupted: false, timedout: false};
        let src = '';

        let code = this.queued_code;
        code = code.replaceAll('console.log(', 'log(bot,');
        code = code.replaceAll('log("', 'log(bot,"');

        // this may cause problems in callback functions
        code = code.replaceAll(';\n', '; if(bot.interrupt_code) {log(bot, "Code interrupted.");return;}\n');
        for (let line of code.split('\n')) {
            src += `    ${line}\n`;
        }
        src = this.code_template.replace('/* CODE HERE */', src);

        console.log("writing to file...", src)

        let filename = this.fp + this.file_counter + '.js';
        // if (this.file_counter > 0) {
        //     let prev_filename = this.fp + (this.file_counter-1) + '.js';
        //     unlink(prev_filename, (err) => {
        //         console.log("deleted file " + prev_filename);
        //         if (err) console.error(err);
        //     });
        // } commented for now, useful to keep files for debugging
        this.file_counter++;

        let write_result = await this.writeFilePromise(filename, src);
        
        if (write_result) {
            console.error('Error writing code execution file: ' + result);
            return {success: false, message: result, interrupted: false, timedout: false};
        }
        let TIMEOUT;
        try {
            console.log('executing code...\n');
            let execution_file = await import('.'+filename);
            await this.stop();
            this.current_code = this.queued_code;

            this.executing = true;
            TIMEOUT = this._startTimeout(10);
            await execution_file.main(this.agent.bot); // open fire
            this.executing = false;
            clearTimeout(TIMEOUT);

            this.agent.bot.emit('finished_executing');
            let output = this.formatOutput(this.agent.bot);
            let interrupted = this.agent.bot.interrupt_code;
            let timedout = this.timedout;
            this.clear();
            return {success:true, message: output, interrupted, timedout};
        } catch (err) {
            this.executing = false;
            clearTimeout(TIMEOUT);

            this.agent.bot.emit('finished_executing');
            console.error("Code execution triggered catch: " + err);
            let message = this.formatOutput(this.agent.bot);
            message += '!!Code threw exception!!  Error: ' + err;
            let interrupted = this.agent.bot.interrupt_code;
            await this.stop();
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
        this.clear();
    }

    clear() {
        this.current_code = '';
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