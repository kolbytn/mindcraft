import { spawn } from 'child_process';
import { logoutAgent } from '../server/mindserver.js';

export class AgentProcess {
    constructor(name) {
        this.name = name;
    }

    start(load_memory=false, init_message=null, count_id=0, host, port) {
        this.count_id = count_id;
        this.running = true;

        let args = ['src/process/init_agent.js', this.name];
        args.push('-n', this.name);
        args.push('-c', count_id);
        if (load_memory)
            args.push('-l', load_memory);
        if (init_message)
            args.push('-m', init_message);
        args.push('-h', host);
        args.push('-p', port);

        const agentProcess = spawn('node', args, {
            stdio: 'inherit',
            stderr: 'inherit',
        });
        
        let last_restart = Date.now();
        agentProcess.on('exit', (code, signal) => {
            console.log(`Agent process exited with code ${code} and signal ${signal}`);
            this.running = false;
            logoutAgent(this.name);
            
            if (code > 1) {
                console.log(`Ending task`);
                process.exit(code);
            }

            if (code !== 0 && signal !== 'SIGINT') {
                // agent must run for at least 10 seconds before restarting
                if (Date.now() - last_restart < 10000) {
                    console.error(`Agent process exited too quickly and will not be restarted.`);
                    return;
                }
                console.log('Restarting agent...');
                this.start(true, 'Agent process restarted.', count_id, host, port);
                last_restart = Date.now();
            }
        });
    
        agentProcess.on('error', (err) => {
            console.error('Agent process error:', err);
        });

        this.process = agentProcess;
    }

    stop() {
        if (!this.running) return;
        this.process.kill('SIGINT');
    }

    continue() {
        if (!this.running) {
            this.start(true, 'Agent process restarted.', this.count_id);
        }
    }
}