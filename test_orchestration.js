// Quick test of orchestration system
import { BotOrchestrator } from './src/orchestration/bot_orchestrator.js';

console.log('Testing BotOrchestrator...');

const orchestrator = new BotOrchestrator();

console.log('Initializing...');
await orchestrator.init();

console.log('Directories created:');
console.log('- .mindcraft-agents/');
console.log('- .mindcraft-agents/profiles/');
console.log('- .mindcraft-agents/logs/');
console.log('- .mindcraft-agents/context/');

console.log('\n✓ Orchestrator initialized successfully!');
console.log('\nTo test spawning a bot, you need to:');
console.log('1. Restart mindcraft: npm start andy');
console.log('2. In Minecraft, type: andy, use the command !spawnBot("tester-1", "Builder", "Test task")');
console.log('3. Or type: andy, !listBots()');
