/**
 * Test Survival Orchestration End-to-End
 *
 * Tests the complete flow:
 * Andy → !surviveMilestone → SurvivalOrchestrator → BotOrchestrator → Gatherer/Crafter bots
 *
 * Run with: node test_survival_orchestration.js
 */

import { SurvivalOrchestrator } from './src/orchestration/survival_orchestrator.js';
import { getCommand } from './src/agent/commands/index.js';
import { existsSync } from 'fs';
import path from 'path';

console.log('='.repeat(60));
console.log('Testing Survival Orchestration End-to-End');
console.log('='.repeat(60));

const baseDir = process.cwd();
let testsPassed = 0;
let testsFailed = 0;

// Mock Andy agent
const mockAndy = {
    name: 'andy',
    bot: {
        inventory: {
            items: () => [
                { name: 'wooden_pickaxe', count: 1 },
                { name: 'wooden_axe', count: 1 },
                { name: 'oak_log', count: 10 }
            ]
        },
        entity: {
            position: { x: 100, y: 64, z: 200 }
        },
        health: 20
    },
    openChat: (msg) => console.log(`  [Andy Says]: ${msg}`)
};

// Test 1: Verify SurvivalOrchestrator can be instantiated
console.log('\n📋 Test 1: Instantiate SurvivalOrchestrator');
try {
    const orchestrator = new SurvivalOrchestrator(mockAndy, baseDir);
    console.log('✅ SurvivalOrchestrator created successfully');
    testsPassed++;
} catch (error) {
    console.log('❌ Failed to create SurvivalOrchestrator:', error.message);
    testsFailed++;
}

// Test 2: Verify SurvivalOrchestrator can load milestones
console.log('\n📋 Test 2: Load current milestone');
try {
    const orchestrator = new SurvivalOrchestrator(mockAndy, baseDir);
    const currentMilestone = orchestrator.getCurrentMilestone();

    if (currentMilestone) {
        console.log(`✅ Current milestone: ${currentMilestone.name}`);
        console.log(`   Description: ${currentMilestone.description}`);
        testsPassed++;
    } else {
        console.log('❌ No current milestone returned');
        testsFailed++;
    }
} catch (error) {
    console.log('❌ Failed to load milestone:', error.message);
    testsFailed++;
}

// Test 3: Verify role mapping
console.log('\n📋 Test 3: Verify role name mapping');
try {
    const orchestrator = new SurvivalOrchestrator(mockAndy, baseDir);

    const tests = [
        { strategy: 'ResourceGatherer', expected: 'Gatherer' },
        { strategy: 'SurvivalCrafter', expected: 'Crafter' },
        { strategy: 'ShelterBuilder', expected: 'Builder' },
        { strategy: 'RecoveryAgent', expected: 'Gatherer' }
    ];

    let allCorrect = true;
    for (const test of tests) {
        const mapped = orchestrator._mapRole(test.strategy);
        if (mapped === test.expected) {
            console.log(`✅ ${test.strategy} → ${mapped}`);
        } else {
            console.log(`❌ ${test.strategy} → ${mapped} (expected ${test.expected})`);
            allCorrect = false;
        }
    }

    if (allCorrect) {
        testsPassed++;
    } else {
        testsFailed++;
    }
} catch (error) {
    console.log('❌ Role mapping failed:', error.message);
    testsFailed++;
}

// Test 4: Verify !surviveMilestone command exists
console.log('\n📋 Test 4: Verify !surviveMilestone command exists');
try {
    const command = getCommand('!surviveMilestone');

    if (command) {
        console.log('✅ !surviveMilestone command found');
        console.log(`   Description: ${command.description}`);
        console.log(`   Params: ${Object.keys(command.params || {}).join(', ')}`);
        testsPassed++;
    } else {
        console.log('❌ !surviveMilestone command not found');
        testsFailed++;
    }
} catch (error) {
    console.log('❌ Command lookup failed:', error.message);
    testsFailed++;
}

// Test 5: Verify !survivalProgress command exists
console.log('\n📋 Test 5: Verify !survivalProgress command exists');
try {
    const command = getCommand('!survivalProgress');

    if (command) {
        console.log('✅ !survivalProgress command found');
        testsPassed++;
    } else {
        console.log('❌ !survivalProgress command not found');
        testsFailed++;
    }
} catch (error) {
    console.log('❌ Command lookup failed:', error.message);
    testsFailed++;
}

// Test 6: Verify !currentMilestone command exists
console.log('\n📋 Test 6: Verify !currentMilestone command exists');
try {
    const command = getCommand('!currentMilestone');

    if (command) {
        console.log('✅ !currentMilestone command found');
        testsPassed++;
    } else {
        console.log('❌ !currentMilestone command not found');
        testsFailed++;
    }
} catch (error) {
    console.log('❌ Command lookup failed:', error.message);
    testsFailed++;
}

// Test 7: Test !survivalProgress command execution
console.log('\n📋 Test 7: Execute !survivalProgress command');
try {
    const command = getCommand('!survivalProgress');
    const result = command.perform(mockAndy);

    if (result && result.includes('Survival Progress')) {
        console.log('✅ !survivalProgress executed successfully');
        console.log('   Output:');
        result.split('\n').forEach(line => console.log(`   ${line}`));
        testsPassed++;
    } else {
        console.log('❌ !survivalProgress returned unexpected output:', result);
        testsFailed++;
    }
} catch (error) {
    console.log('❌ !survivalProgress execution failed:', error.message);
    testsFailed++;
}

// Test 8: Test !currentMilestone command execution
console.log('\n📋 Test 8: Execute !currentMilestone command');
try {
    const command = getCommand('!currentMilestone');
    const result = command.perform(mockAndy);

    if (result && result.includes('milestone')) {
        console.log('✅ !currentMilestone executed successfully');
        console.log('   Output:');
        result.split('\n').forEach(line => console.log(`   ${line}`));
        testsPassed++;
    } else {
        console.log('❌ !currentMilestone returned unexpected output:', result);
        testsFailed++;
    }
} catch (error) {
    console.log('❌ !currentMilestone execution failed:', error.message);
    testsFailed++;
}

// Test 9: Verify strategy loading for all milestones
console.log('\n📋 Test 9: Verify all milestone strategies load');
try {
    const orchestrator = new SurvivalOrchestrator(mockAndy, baseDir);
    const milestones = [
        'survive_first_night',
        'wooden_tools',
        'stone_tools',
        'iron_tools',
        'diamond_pickaxe'
    ];

    let allLoaded = true;
    for (const milestoneName of milestones) {
        const strategy = orchestrator.milestoneTracker.getStrategy(milestoneName);
        if (strategy && strategy.tasks && strategy.tasks.length > 0) {
            console.log(`✅ ${milestoneName}: ${strategy.tasks.length} tasks`);
        } else {
            console.log(`❌ ${milestoneName}: Failed to load strategy`);
            allLoaded = false;
        }
    }

    if (allLoaded) {
        testsPassed++;
    } else {
        testsFailed++;
    }
} catch (error) {
    console.log('❌ Strategy loading failed:', error.message);
    testsFailed++;
}

// Test 10: Verify BotOrchestrator integration
console.log('\n📋 Test 10: Verify BotOrchestrator integration');
try {
    const orchestrator = new SurvivalOrchestrator(mockAndy, baseDir);

    if (orchestrator.botOrchestrator) {
        console.log('✅ BotOrchestrator instance created');

        // Check that BotOrchestrator has required methods
        const requiredMethods = ['_runPhase', '_spawnParallelTeam', 'init'];
        let hasAllMethods = true;

        for (const method of requiredMethods) {
            if (typeof orchestrator.botOrchestrator[method] === 'function') {
                console.log(`✅ BotOrchestrator has ${method}()`);
            } else {
                console.log(`❌ BotOrchestrator missing ${method}()`);
                hasAllMethods = false;
            }
        }

        if (hasAllMethods) {
            testsPassed++;
        } else {
            testsFailed++;
        }
    } else {
        console.log('❌ BotOrchestrator not initialized');
        testsFailed++;
    }
} catch (error) {
    console.log('❌ BotOrchestrator integration failed:', error.message);
    testsFailed++;
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('Test Results:');
console.log(`  ✅ Passed: ${testsPassed}`);
console.log(`  ❌ Failed: ${testsFailed}`);
console.log('='.repeat(60));

if (testsFailed === 0) {
    console.log('\n🎉 All tests passed! Survival Orchestration ready!');
    console.log('\n✅ Week 3 Integration Complete:');
    console.log('   - SurvivalOrchestrator: Implemented ✓');
    console.log('   - !surviveMilestone command: Added ✓');
    console.log('   - !survivalProgress command: Added ✓');
    console.log('   - !currentMilestone command: Added ✓');
    console.log('   - Role mapping: Working ✓');
    console.log('   - BotOrchestrator integration: Working ✓');
    console.log('\n📝 Next Steps:');
    console.log('   1. Update andy.json to use !surviveMilestone');
    console.log('   2. Test with real Minecraft server');
    console.log('   3. Debug any bot spawning issues');
    console.log('   4. Iterate on prompts based on real-world testing');
} else {
    console.log('\n❌ Some tests failed. Review configuration.');
    process.exit(1);
}
