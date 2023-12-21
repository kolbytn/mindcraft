import { spawn } from 'child_process';

export class AgentProcess {
    constructor(name) {
        this.name = name;
    }
    start(clear_memory=false, autostart=false, profile='assist') {
        let args = ['controller/init-agent.js', this.name];
        args.push('-p', profile);
        if (clear_memory)
            args.push('-c');
        if (autostart)
            args.push('-a');

        const agentProcess = spawn('node', args, {
            stdio: 'inherit',
            stderr: 'inherit',
        });
        
        let last_restart = Date.now();
        agentProcess.on('exit', (code, signal) => {
            console.log(`Agent process exited with code ${code} and signal ${signal}`);
            
            if (code !== 0) {
                // agent must run for at least 30 seconds before restarting
                if (Date.now() - last_restart < 30 * 1000) {
                    console.error('Agent process exited too quickly. Killing entire process. Goodbye.');
                    process.exit(1);
                }
                console.log('Restarting agent...');
                this.start(false, true);
                last_restart = Date.now();
            }
        });
    
        agentProcess.on('error', (err) => {
            console.error('Failed to start agent process:', err);
        });
    }
}