import { writeFile, readFile, mkdirSync } from 'fs';
import { sendRequest, embed, cosineSimilarity } from '../utils/gpt.js';
import { stringifyTurns } from '../utils/text.js';


export class Coder {
    constructor(agent) {
        this.agent = agent;
        this.queued_code = '';
        this.current_code = '';
        this.file_counter = 0;
        this.fp = '/bots/'+agent.name+'/action-code/';
        this.agent.bot.interrupt_code = false;
        this.executing = false;
        this.agent.bot.output = '';
        this.code_template = '';
        this.timedout = false;
        this.fewshot = 3;
        this.examples = [];

        readFile('./bots/template.js', 'utf8', (err, data) => {
            if (err) throw err;
            this.code_template = data;
        });

        mkdirSync('.' + this.fp, { recursive: true });
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

    async loadExamples() {
        let examples = [];
        try {
            const data = readFileSync('./src/examples.json', 'utf8');
            examples = JSON.parse(data);
        } catch (err) {
            console.log('No history examples found.');
        }

        this.examples = [];
        for (let example of examples) {
            let context = '';
            for (let turn of example.conversation) {
                context += turn.content + '\n';
            }
            context = context.trim();
            const embedding = await embed(context);
            this.examples.push({'embedding': embedding, 'turns': example});
        }

        await this.setExamples();
    }

    async sortExamples(messages) {
        let context = '';
        for (let turn of messages) {
            context += turn.content + '\n';
        }
        context = context.trim();
        const embedding = await embed(context);
        this.examples.sort((a, b) => {
            return cosineSimilarity(a.embedding, embedding) - cosineSimilarity(b.embedding, embedding);
        });
    }

    async generateCode(agent_history) {
        let system_message = "You are a minecraft bot that plays minecraft by writing javascript. Given the conversation between you and the user, use the provided skills and world queries to write your code. You will then be given a response to your code. If you are satisfied with the response, return output without writing any additional code. If you want to try again, output the code you want to try.";
        system_message += getSkillDocs();

        let messages = [];
        this.sortExamples(agent_history.turns);
        for (let example of this.examples.slice(-this.fewshot)) {
            messages.push({
                role: 'user',
                content: stringifyTurns(example.conversation)
            });
            for (let i = 0; i < example.coder.length; i++) {
                messages.push({
                    role: i % 2 == 0 ? 'assistant' : 'user',
                    content: example.coder[i]
                });
            }
        }
        messages.push({
            role: 'user',
            content: stringifyTurns(agent_history.turns),
        });

        let final_message = 'No code generated.';
        for (let i=0; i<5; i++) {

            let res = await sendRequest(messages, system_message);
            let code = res.substring(res.indexOf('```')+3, res.lastIndexOf('```'));

            if (!code)
                break;

            agent.coder.queueCode(code);
            let code_return = await agent.coder.execute();

            if (code_return.interrupted && !custom_return.timedout)
                break;

            messages.push({
                role: 'assistant',
                content: res
            });
            messages.push({
                role: 'user',
                content: code_return.message
            });
            final_message = code_return.message;
        }

        return final_message;
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
            return {success: false, message: result, interrupted: false, timedout: false};
        }
        let TIMEOUT;
        try {
            console.log('executing code...\n');
            let execution_file = await import('../..' + this.fp + filename);
            await this.stop();
            this.current_code = this.queued_code;

            this.executing = true;
            TIMEOUT = this._startTimeout(10);
            await execution_file.main(this.agent.bot); // open fire
            this.executing = false;
            clearTimeout(TIMEOUT);

            let output = this.formatOutput(this.agent.bot);
            let interrupted = this.agent.bot.interrupt_code;
            let timedout = this.timedout;
            this.clear();
            this.agent.bot.emit("code_terminated");
            return {success:true, message: output, interrupted, timedout};
        } catch (err) {
            this.executing = false;
            clearTimeout(TIMEOUT);

            console.error("Code execution triggered catch: " + err);
            let message = this.formatOutput(this.agent.bot);
            message += '!!Code threw exception!!  Error: ' + err;
            let interrupted = this.agent.bot.interrupt_code;
            await this.stop();
            this.agent.bot.emit("code_terminated");
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