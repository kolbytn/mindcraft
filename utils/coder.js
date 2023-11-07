import { writeFile } from 'fs';

export class Coder {
    constructor(agent) {
        this.agent = agent;
        this.current_code = '';
        this.filename = './temp.js';
        this.execution_file = import('.'+this.filename);
    }

    queueCode(code) {
        this.current_code = code;
    }

    hasCode() {
        return this.current_code.length > 0;
    }

    async execute() {
        if (!this.current_code) return {success: false, message: "No code to execute."};
        let src = "import * as skills from './utils/skills.js';";
        src += "\nimport * as world from './utils/world.js';"
        src += `\n\nexport async function main(bot) {\n`;
        for (let line of this.current_code.split('\n')) {
            src += `    ${line}\n`;
        }
        src += `    return true;\n}\n`; // potentially redundant return statement, agent doesn't need to write a return statement


        console.log("writing to file...", src)
        
        writeFile(this.filename, src, async (err) => {

            console.log('done writing file')
            if (err) throw err;
            try {
                console.log('beginning execution...')
                delete this.execution_file;
                this.execution_file = await import('.'+this.filename);
    
                let success = await this.execution_file.main(this.agent.bot);
                this.current_code = '';
                // return {success, message: ""};
            } catch (err) {
                console.log(err);
                this.current_code = '';
                // return {success: false, message: err};
            }
        });
        return {success: true, message: "yay"};
    
        
    }
}