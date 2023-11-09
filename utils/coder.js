import { writeFile, unlink } from 'fs';

export class Coder {
    constructor(agent) {
        this.agent = agent;
        this.current_code = '';
        this.file_counter = 0;
        this.fp = './agent_code/';
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
        let src = "import * as skills from '../utils/skills.js';";
        src += "\nimport * as world from '../utils/world.js';"
        src += "\nimport Vec3 from 'vec3';"
        src += `\n\nexport async function main(bot) {\n`;
        for (let line of this.current_code.split('\n')) {
            src += `    ${line}\n`;
        }
        src += `    return true;\n}\n`; // potentially redundant return statement, in case agent doesn't return anything

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
            this.clear();
            let success = await execution_file.main(this.agent.bot);
            let message = success ? 'Code await returned successfully.' : 'Code await return failed!';
            if (success)
                console.log(message)
            else
                console.error(message);
            return {success, message};
        } catch (err) {
            console.error("Code execution triggered catch:" + err);
            this.clear();
            return {success: false, message: err};
        }
    }

    clear() {
        this.current_code = '';
        this.agent.bot.pathfinder.setGoal(null);
    }
}