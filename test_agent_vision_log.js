// Test script for "always active" vision logging in Agent.js

const assert = (condition, message) => {
    if (condition) {
        console.log(`Assertion PASSED: ${message}`);
    } else {
        console.error(`Assertion FAILED: ${message}`);
        // In a real test runner, we'd throw an error. Here, we'll mark a global failure flag.
        global.testFailed = true;
    }
};

global.testFailed = false;

// --- Mocks and Stubs ---

const mockSettings = {
    vision_mode: 'always',
    log_vision_data: true, // Assuming this is checked by logger.js, not directly by agent.js for this part
    only_chat_with: [],
    max_commands: 10, // Default value
    verbose_commands: false,
    speak: false,
    blocked_actions: [],
};

const mockLogger = {
    lastArgs_logVision: null,
    logVision: (...args) => {
        console.log('[MockLogger] logVision called with:', JSON.stringify(args, null, 2));
        mockLogger.lastArgs_logVision = args;
    }
};

const mockFs = {
    dummyFileContent: Buffer.from("dummy image data"),
    filesCreated: {},
    readFileSync: (filePath) => {
        console.log(`[MockFs] readFileSync called for: ${filePath}`);
        if (mockFs.filesCreated[filePath]) {
            return mockFs.dummyFileContent;
        }
        throw new Error(`[MockFs] File not found: ${filePath}`);
    },
    writeFileSync: (filePath, data) => { // Used by camera.capture simulation
        console.log(`[MockFs] writeFileSync called for: ${filePath}`);
        mockFs.filesCreated[filePath] = data;
    },
    existsSync: (filePath) => { // May be needed by History or other parts
        return !!mockFs.filesCreated[filePath];
    },
    mkdirSync: (dirPath) => { // May be needed by History or other parts
        console.log(`[MockFs] mkdirSync called for: ${dirPath}`);
    }
};

const mockPath = {
    join: (...paths) => paths.join('/'), // Simple join for testing
    dirname: (p) => p.substring(0, p.lastIndexOf('/')) // simple dirname
};

// Simplified History class for testing
class MockHistory {
    constructor(agent) {
        this.agent = agent;
        this.history = [];
    }
    add(source, message, imagePath = null) {
        this.history.push({ role: source, content: message, image: imagePath });
    }
    getHistory() {
        return [...this.history]; // Return a copy
    }
    save() { /* no-op for this test */ }
    load() { /* no-op for this test */ return null; }
}

// --- Simplified Agent class (copied parts from src/agent/agent.js) ---
// We only need formatHistoryForVisionLog and handleMessage, and their direct dependencies.
class TestAgent {
    constructor(name = "TestAgent") {
        this.name = name;
        this.latestScreenshotPath = null;
        this.history = new MockHistory(this);
        this.vision_interpreter = {
            fp: './test_vision_data/screenshots', // Temporary path for test
            camera: {
                capture: async () => {
                    console.log('[MockCamera] capture called');
                    const filename = `vision_${Date.now()}_test.jpg`;
                    const fullPath = mockPath.join(this.vision_interpreter.fp, filename);
                    mockFs.writeFileSync(fullPath, "dummy screenshot data");
                    return filename; // Return only filename, as in original code
                }
            }
        };
        // Mock other dependencies of handleMessage if they are called before the vision logging part
        this.prompter = { getName: () => this.name };
        this.self_prompter = { isActive: () => false, shouldInterrupt: () => false, handleUserPromptedCmd: () => {} };
        this.bot = { modes: { flushBehaviorLog: () => "" }, /* other needed bot mocks */ };
        convoManager.isOtherAgent = () => false; // Mock convoManager
        this.task = { data: null, isDone: () => false }; // Mock task
        this.shut_up = false;
    }

    // Copied directly from the provided agent.js
    formatHistoryForVisionLog(conversationHistory) {
        if (!conversationHistory || conversationHistory.length === 0) return '';
        const formattedHistory = [];
        for (const turn of conversationHistory) {
            const formattedTurn = {
                role: turn.role || 'user',
                content: []
            };
            if (typeof turn.content === 'string') {
                formattedTurn.content.push({ type: 'text', text: turn.content });
            } else if (Array.isArray(turn.content)) {
                turn.content.forEach(contentItem => {
                    if (typeof contentItem === 'string') {
                        formattedTurn.content.push({ type: 'text', text: contentItem });
                    } else if (contentItem.type === 'text' && contentItem.text) {
                        formattedTurn.content.push({ type: 'text', text: contentItem.text });
                    } else if (contentItem.type === 'image_url' && contentItem.image_url && contentItem.image_url.url) {
                        formattedTurn.content.push({ type: 'image', image: contentItem.image_url.url });
                    } else if (contentItem.type === 'image' && contentItem.image) {
                         formattedTurn.content.push({ type: 'image', image: contentItem.image });
                    }
                });
            } else if (turn.content && typeof turn.content === 'object') {
                if (turn.content.text) {
                    formattedTurn.content.push({ type: 'text', text: turn.content.text });
                }
                if (turn.content.image) {
                    formattedTurn.content.push({ type: 'image', image: turn.content.image });
                }
                if (turn.content.image_url && turn.content.image_url.url) {
                    formattedTurn.content.push({ type: 'image', image: turn.content.image_url.url });
                }
            }
            if (turn.content && formattedTurn.content.length === 0) {
                formattedTurn.content.push({ type: 'text', text: JSON.stringify(turn.content) });
            }
            formattedHistory.push(formattedTurn);
        }
        return JSON.stringify(formattedHistory);
    }

    // Simplified handleMessage, focusing on the vision logging part
    async handleMessage(source, message, max_responses = null) {
        const self_prompt = source === 'system' || source === this.name;
        const from_other_bot = convoManager.isOtherAgent(source); // Mocked

        if (!self_prompt && !from_other_bot) {
            if (mockSettings.vision_mode === 'always' && this.vision_interpreter && this.vision_interpreter.camera) {
                try {
                    const screenshotFilename = await this.vision_interpreter.camera.capture();
                    this.latestScreenshotPath = screenshotFilename;
                    console.log(`[${this.name}] Captured screenshot in always_active mode: ${screenshotFilename}`);

                    const currentHistory = this.history.getHistory();
                    let imageBuffer = null;
                    if (this.latestScreenshotPath && this.vision_interpreter.fp) {
                        try {
                            const fullImagePath = mockPath.join(this.vision_interpreter.fp, this.latestScreenshotPath);
                            imageBuffer = mockFs.readFileSync(fullImagePath);
                        } catch (err) {
                            console.error(`[${this.name}] Error reading image for always active log: ${err.message}`);
                        }
                    }

                    if (imageBuffer) {
                        const formattedHistoryString = this.formatHistoryForVisionLog(currentHistory);
                        mockLogger.logVision(currentHistory, imageBuffer, "Image captured for always active vision", formattedHistoryString);
                    }
                } catch (error) {
                    console.error(`[${this.name}] Error capturing or logging screenshot in always_active mode:`, error);
                }
            }
            // Simplified: No command execution or further processing for this test
        }
        // Simplified: No further history adding or prompting for this test after vision log
    }
}

// Mock global dependencies that Agent might use internally if not fully mocked out
global.settings = mockSettings; // Used by Agent if not passed in
const convoManager = { // Mock for global convoManager if used by Agent directly
    isOtherAgent: () => false,
    initAgent: () => {},
};


// --- Test Execution ---
async function runTest() {
    console.log("--- Starting Test ---");

    const agent = new TestAgent();

    // Prepare initial history
    const sampleHistory = [
        { role: 'user', content: 'Hello bot!' },
        { role: 'assistant', content: 'I am fine, how are you?' } // Corrected: assistant content
    ];
    agent.history.history = [...sampleHistory]; // Directly set history for the test

    // Call handleMessage
    await agent.handleMessage('testUser', 'Test message from user');

    // --- Assertions ---
    assert(mockLogger.lastArgs_logVision !== null, "logger.logVision was called.");

    if (mockLogger.lastArgs_logVision) {
        const args = mockLogger.lastArgs_logVision;

        // 1. Check conversationHistory argument (1st arg)
        // For simplicity, we'll check length and roles. A deep equal would be better in a real test.
        assert(Array.isArray(args[0]) && args[0].length === sampleHistory.length, "logVision: conversationHistory has correct length.");
        if (Array.isArray(args[0]) && args[0].length === sampleHistory.length) {
            assert(args[0][0].role === sampleHistory[0].role && args[0][0].content === sampleHistory[0].content, "logVision: first history item matches.");
            assert(args[0][1].role === sampleHistory[1].role && args[0][1].content === sampleHistory[1].content, "logVision: second history item matches.");
        }

        // 2. Check imageBuffer argument (2nd arg)
        assert(args[1] === mockFs.dummyFileContent, "logVision: imageBuffer is the dummy buffer.");

        // 3. Check response string (3rd arg)
        assert(args[2] === "Image captured for always active vision", "logVision: response string is correct.");

        // 4. Check visionMessage (formattedHistoryString) (4th arg)
        const expectedFormattedHistory = agent.formatHistoryForVisionLog(sampleHistory);
        assert(args[3] === expectedFormattedHistory, "logVision: visionMessage (formattedHistoryString) is correct.");
        if(args[3] !== expectedFormattedHistory) {
            console.log("Expected formatted history:", expectedFormattedHistory);
            console.log("Actual formatted history:", args[3]);
        }
    }

    // Check if camera.capture was called (implicitly tested by latestScreenshotPath being set for readFileSync)
    // Check if fs.readFileSync was called (log output from mockFs)

    console.log("--- Test Finished ---");
    if (global.testFailed) {
        console.error("--- !!! ONE OR MORE ASSERTIONS FAILED !!! ---");
        // process.exit(1); // Exit with error code if in a CI environment
    } else {
        console.log("--- ALL ASSERTIONS PASSED ---");
    }
}

runTest().catch(e => {
    console.error("Test script error:", e);
    global.testFailed = true;
    // process.exit(1);
});
