import { spawn } from 'child_process';

class AgentController {
    constructor(name) {
        this.name = name;
    }
    async start(restart_memory=false) {
        let args = ['init_agent.js', this.name];
        if (restart_memory)
            args.push('-r');
        const agentProcess = spawn('node', args, {
            stdio: 'inherit',
            stderr: 'inherit',
        });
    
        agentProcess.on('exit', (code, signal) => {
            console.log(`Agent process exited with code ${code} and signal ${signal}`);
            
            // Restart the agent if it exited due to an error
            if (code !== 0) {
                console.log('Restarting agent...');
                this.start();
            }
        });
    
        agentProcess.on('error', (err) => {
            console.error('Failed to start agent process:', err);
        });
    }
}

new AgentController('andy').start();