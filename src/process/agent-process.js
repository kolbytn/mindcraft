import { spawn } from 'child_process';

export class AgentProcess {
    static runningCount = 0;

    start(profile, load_memory=false, init_message=null, count_id=0, task_path=null, task_id=null) {
        let args = ['src/process/init-agent.js', this.name];
        args.push('-p', profile);
        args.push('-c', count_id);
        if (load_memory)
            args.push('-l', load_memory);
        if (init_message)
            args.push('-m', init_message);
        if (task_path)
            args.push('-t', task_path);
        if (task_id)
            args.push('-i', task_id);

        const agentProcess = spawn('node', args, {
            stdio: 'inherit',
            stderr: 'inherit',
        });
        AgentProcess.runningCount++;
        
        let last_restart = Date.now();
        agentProcess.on('exit', (code, signal) => {
            console.log(`Agent process exited with code ${code} and signal ${signal}`);
            
            if (code === 2) {
                console.log(`Task completed successfully`);
                process.exit(2, signal);
            }

            if (code === 3) {
                console.log(`Task failed due to reaching timeout`);
                process.exit(3);
            }

            if (code === 4) {
                console.log(`Task failed as all agents weren't correctly spawned `);
                process.exit(4);
            }

            if (code !== 0) {
                // agent must run for at least 10 seconds before restarting
                if (Date.now() - last_restart < 10000) {
                    console.error(`Agent process ${profile} exited too quickly and will not be restarted.`);
                    AgentProcess.runningCount--;
                    if (AgentProcess.runningCount <= 0) {
                        console.error('All agent processes have ended. Exiting.');
                        process.exit(0);
                    }
                    return;
                }
                console.log('Restarting agent...');
                this.start(profile, true, 'Agent process restarted.', count_id, task_path, task_id);
                last_restart = Date.now();
            }
        });
    
        agentProcess.on('error', (err) => {
            console.error('Agent process error:', err);
        });
    }
}