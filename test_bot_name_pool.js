/**
 * Test Bot Name Pool
 *
 * Tests the bot name pool allocation/release functionality.
 *
 * Run with: node test_bot_name_pool.js
 */

import { BotNamePool } from './src/orchestration/bot_name_pool.js';

console.log('='.repeat(60));
console.log('Testing Bot Name Pool');
console.log('='.repeat(60));

let testsPassed = 0;
let testsFailed = 0;

// Test 1: Initialize pool
console.log('\n📋 Test 1: Initialize pool');
try {
    const pool = new BotNamePool();
    const capacity = pool.getTotalCapacity();

    if (capacity === 90) {
        console.log(`✅ Pool initialized with ${capacity} total slots`);
        testsPassed++;
    } else {
        console.log(`❌ Expected 90 slots, got ${capacity}`);
        testsFailed++;
    }
} catch (error) {
    console.log(`❌ Failed to initialize pool: ${error.message}`);
    testsFailed++;
}

// Test 2: Allocate single name
console.log('\n📋 Test 2: Allocate single name');
try {
    const pool = new BotNamePool();
    const name = pool.allocateName('Gatherer');

    if (name === 'gatherer-1') {
        console.log(`✅ Allocated: ${name}`);
        testsPassed++;
    } else {
        console.log(`❌ Expected gatherer-1, got ${name}`);
        testsFailed++;
    }
} catch (error) {
    console.log(`❌ Allocation failed: ${error.message}`);
    testsFailed++;
}

// Test 3: Allocate multiple names
console.log('\n📋 Test 3: Allocate multiple names');
try {
    const pool = new BotNamePool();
    const names = [];

    for (let i = 0; i < 5; i++) {
        names.push(pool.allocateName('Gatherer'));
    }

    const expected = ['gatherer-1', 'gatherer-2', 'gatherer-3', 'gatherer-4', 'gatherer-5'];
    const matches = names.every((name, i) => name === expected[i]);

    if (matches) {
        console.log(`✅ Allocated 5 names: ${names.join(', ')}`);
        testsPassed++;
    } else {
        console.log(`❌ Expected ${expected.join(', ')}, got ${names.join(', ')}`);
        testsFailed++;
    }
} catch (error) {
    console.log(`❌ Multiple allocation failed: ${error.message}`);
    testsFailed++;
}

// Test 4: Release and reallocate
console.log('\n📋 Test 4: Release and reallocate');
try {
    const pool = new BotNamePool();

    // Allocate 3 names
    const name1 = pool.allocateName('Gatherer');
    const name2 = pool.allocateName('Gatherer');
    const name3 = pool.allocateName('Gatherer');

    // Release second name
    pool.releaseName(name2);

    // Allocate again - pool uses FIFO, so we get next available (gatherer-4)
    const name4 = pool.allocateName('Gatherer');

    if (name4 === 'gatherer-4') {
        console.log(`✅ Released ${name2}, allocated ${name4} (FIFO behavior)`);
        testsPassed++;
    } else {
        console.log(`❌ Expected gatherer-4, got ${name4}`);
        testsFailed++;
    }
} catch (error) {
    console.log(`❌ Release/reallocate failed: ${error.message}`);
    testsFailed++;
}

// Test 5: Pool exhaustion
console.log('\n📋 Test 5: Pool exhaustion');
try {
    const pool = new BotNamePool({ 'Gatherer': 3 }); // Only 3 slots

    // Allocate all 3
    const name1 = pool.allocateName('Gatherer');
    const name2 = pool.allocateName('Gatherer');
    const name3 = pool.allocateName('Gatherer');

    // Try to allocate 4th - should fail
    const name4 = pool.allocateName('Gatherer');

    if (name4 === null) {
        console.log(`✅ Pool correctly exhausted after 3 allocations`);
        testsPassed++;
    } else {
        console.log(`❌ Expected null (exhausted), got ${name4}`);
        testsFailed++;
    }
} catch (error) {
    console.log(`❌ Exhaustion test failed: ${error.message}`);
    testsFailed++;
}

// Test 6: Available count tracking
console.log('\n📋 Test 6: Available count tracking');
try {
    const pool = new BotNamePool({ 'Gatherer': 10 });

    const initial = pool.getAvailableCount('Gatherer');

    // Allocate 3
    pool.allocateName('Gatherer');
    pool.allocateName('Gatherer');
    pool.allocateName('Gatherer');

    const afterAlloc = pool.getAvailableCount('Gatherer');

    if (initial === 10 && afterAlloc === 7) {
        console.log(`✅ Available count: ${initial} → ${afterAlloc} (allocated 3)`);
        testsPassed++;
    } else {
        console.log(`❌ Expected 10 → 7, got ${initial} → ${afterAlloc}`);
        testsFailed++;
    }
} catch (error) {
    console.log(`❌ Available count test failed: ${error.message}`);
    testsFailed++;
}

// Test 7: Multiple roles
console.log('\n📋 Test 7: Multiple roles');
try {
    const pool = new BotNamePool();

    const gatherer = pool.allocateName('Gatherer');
    const crafter = pool.allocateName('Crafter');
    const builder = pool.allocateName('Builder');

    if (gatherer === 'gatherer-1' && crafter === 'crafter-1' && builder === 'builder-1') {
        console.log(`✅ Multiple roles: ${gatherer}, ${crafter}, ${builder}`);
        testsPassed++;
    } else {
        console.log(`❌ Role allocation mismatch`);
        testsFailed++;
    }
} catch (error) {
    console.log(`❌ Multiple roles test failed: ${error.message}`);
    testsFailed++;
}

// Test 8: Status reporting
console.log('\n📋 Test 8: Status reporting');
try {
    const pool = new BotNamePool({ 'Gatherer': 5, 'Crafter': 5 });

    // Allocate some
    pool.allocateName('Gatherer');
    pool.allocateName('Gatherer');
    pool.allocateName('Crafter');

    const status = pool.getStatus();

    const gathererOK = status['Gatherer'].allocated === 2 && status['Gatherer'].available === 3;
    const crafterOK = status['Crafter'].allocated === 1 && status['Crafter'].available === 4;

    if (gathererOK && crafterOK) {
        console.log(`✅ Status correct: Gatherer (2/5), Crafter (1/5)`);
        testsPassed++;
    } else {
        console.log(`❌ Status mismatch`);
        testsFailed++;
    }
} catch (error) {
    console.log(`❌ Status test failed: ${error.message}`);
    testsFailed++;
}

// Test 9: Cleanup stale allocations
console.log('\n📋 Test 9: Cleanup stale allocations');
try {
    const pool = new BotNamePool({ 'Gatherer': 5 });

    // Allocate
    const name1 = pool.allocateName('Gatherer');

    // Manually set old timestamp (simulate stale allocation)
    pool.allocated[name1].allocatedAt = Date.now() - (7200 * 1000); // 2 hours ago

    // Clean up stale (>1 hour)
    const cleaned = pool.cleanupStaleAllocations(3600); // 1 hour max age

    if (cleaned === 1) {
        console.log(`✅ Cleaned up ${cleaned} stale allocation(s)`);
        testsPassed++;
    } else {
        console.log(`❌ Expected 1 cleanup, got ${cleaned}`);
        testsFailed++;
    }
} catch (error) {
    console.log(`❌ Cleanup test failed: ${error.message}`);
    testsFailed++;
}

// Test 10: Release all
console.log('\n📋 Test 10: Release all');
try {
    const pool = new BotNamePool({ 'Gatherer': 5 });

    // Allocate several
    pool.allocateName('Gatherer');
    pool.allocateName('Gatherer');
    pool.allocateName('Gatherer');

    const beforeRelease = pool.getAllocatedCount('Gatherer');

    // Release all
    pool.releaseAll();

    const afterRelease = pool.getAllocatedCount('Gatherer');

    if (beforeRelease === 3 && afterRelease === 0) {
        console.log(`✅ Released all: ${beforeRelease} → ${afterRelease}`);
        testsPassed++;
    } else {
        console.log(`❌ Expected 3 → 0, got ${beforeRelease} → ${afterRelease}`);
        testsFailed++;
    }
} catch (error) {
    console.log(`❌ Release all test failed: ${error.message}`);
    testsFailed++;
}

// Test 11: Integration with settings.js config
console.log('\n📋 Test 11: Integration with settings.js config');
try {
    const config = {
        'Gatherer': 20,
        'Crafter': 20,
        'Builder': 20,
        'Scout': 10,
        'Architect': 10,
        'Tester': 10
    };

    const pool = new BotNamePool(config);
    const capacity = pool.getTotalCapacity();

    if (capacity === 90) {
        console.log(`✅ Config integration: ${capacity} total slots`);
        testsPassed++;
    } else {
        console.log(`❌ Expected 90, got ${capacity}`);
        testsFailed++;
    }
} catch (error) {
    console.log(`❌ Config integration failed: ${error.message}`);
    testsFailed++;
}

// Test 12: Allocation after full cycle
console.log('\n📋 Test 12: Allocation after full cycle');
try {
    const pool = new BotNamePool({ 'Gatherer': 3 });

    // Allocate all
    const n1 = pool.allocateName('Gatherer');
    const n2 = pool.allocateName('Gatherer');
    const n3 = pool.allocateName('Gatherer');

    // Release all
    pool.releaseName(n1);
    pool.releaseName(n2);
    pool.releaseName(n3);

    // Should be able to allocate again
    const n4 = pool.allocateName('Gatherer');
    const n5 = pool.allocateName('Gatherer');
    const n6 = pool.allocateName('Gatherer');

    const allocated = pool.getAllocatedCount('Gatherer');

    if (allocated === 3) {
        console.log(`✅ Full cycle: allocated → released → reallocated`);
        testsPassed++;
    } else {
        console.log(`❌ Expected 3 allocated, got ${allocated}`);
        testsFailed++;
    }
} catch (error) {
    console.log(`❌ Full cycle test failed: ${error.message}`);
    testsFailed++;
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('Test Results:');
console.log(`  ✅ Passed: ${testsPassed}`);
console.log(`  ❌ Failed: ${testsFailed}`);
console.log('='.repeat(60));

if (testsFailed === 0) {
    console.log('\n🎉 All tests passed! Bot name pool is working correctly!');
    console.log('\n✅ Ready for integration with BotOrchestrator');
    console.log('\n📝 Next steps:');
    console.log('   1. Apply whitelist commands (scripts/whitelist_bots.txt)');
    console.log('   2. Test with real Minecraft server');
    console.log('   3. Verify bots can join with pooled names');
} else {
    console.log('\n❌ Some tests failed. Review implementation.');
    process.exit(1);
}
