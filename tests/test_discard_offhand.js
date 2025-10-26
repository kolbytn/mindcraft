(async () => {
    // lightweight test for skills.discard to ensure items in off-hand slots are found
    const path = '../src/agent/library/skills.js';
    const skills = await import(path);

    const tossCalls = [];

    const bot = {
        inventory: {
            // no items() entries (simulates bug where off-hand isn't included)
            items: () => [],
            // slots: include an off-hand slot with index commonly 45 in mineflayer (varies) — we don't rely on index meaning
            slots: {
                0: null,
                1: null,
                40: { type: 5000, name: 'torch', count: 2 }, // off-hand-like slot
            },
        },
        // toss should be called with (type, null, count)
        toss: async (type, _null, count) => {
            tossCalls.push({ type, count });
            // simulate removing the item from slots
            for (const k of Object.keys(bot.inventory.slots)) {
                const s = bot.inventory.slots[k];
                if (s && s.type === type) {
                    s.count -= count;
                    if (s.count <= 0) bot.inventory.slots[k] = null;
                    break;
                }
            }
        },
    };

    console.log('Running discard test (off-hand)');
    const ok = await skills.discard(bot, 'torch', 1);
    console.log('discard returned:', ok);
    console.log('tossCalls:', JSON.stringify(tossCalls));

    if (!ok) {
        console.error('TEST FAILED: discard returned false');
        process.exit(1);
    }
    if (tossCalls.length !== 1) {
        console.error('TEST FAILED: toss was not called exactly once');
        process.exit(1);
    }
    if (tossCalls[0].count !== 1) {
        console.error('TEST FAILED: toss called with wrong count', tossCalls[0]);
        process.exit(1);
    }

    console.log('TEST PASSED');
})();
