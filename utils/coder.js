import { writeFile, readFile, unlink } from 'fs';

export class Coder {
    constructor(agent) {
        this.agent = agent;
        this.current_code = '';
        this.file_counter = 0;
        this.fp = './agent_code/';
        this.agent.bot.output = '';
        this.code_template = '';

        readFile(this.fp+'template.js', 'utf8', (err, data) => {
            if (err) throw err;
            console.log('Template str:', data);
            this.code_template = data;
        });
    }

    queueCode(code) {
        this.current_code = this.santitizeCode(code);
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

    hasCode() {
        return this.current_code.length > 0;
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

    async execute() {
        if (!this.current_code) return {success: false, message: "No code to execute."};
        if (!this.code_template) return {success: false, message: "Code template not loaded."};
        let src = '';
        for (let line of this.current_code.split('\n')) {
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
            return {success: false, message: result};
        }

        try {
            console.log('executing code...\n');
            let execution_file = await import('.'+filename);
            this.stop();
            let success = await execution_file.main(this.agent.bot);
            console.log('code execution finished.', success)
            let output = this.agent.bot.output ? 'Code output: \n' + this.agent.bot.output : ''; 
            // if there is output, add it to the message
            if (success)
                output += 'Code execution finished successfully.';
            else
                output += 'Code execution failed!';
            console.log(output)
            this.clear();
            return {success, message: output};
        } catch (err) {
            console.error("Code execution triggered catch:" + err);
            let message = 'Code output: \n' + this.agent.bot.output + '\n';
            message += '!!Code threw exception!!  Error: ' + err;
            this.stop();
            return {success: false, message};
        }
    }

    clear() {
        this.current_code = '';
        this.agent.bot.output = '';
    }

    stop() {
        this.clear();
        this.agent.bot.pathfinder.setGoal(null);
    }
}