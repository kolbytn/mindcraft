import { writeFileSync, mkdirSync, existsSync, appendFileSync, readFileSync } from 'fs';
import { join } from 'path';
import settings from './settings.js'; // Import settings
import path from 'path'; // Needed for path operations

// --- Configuration ---
const LOGS_DIR = './logs';
const VISION_DATASET_DIR = join(LOGS_DIR, 'vision_dataset'); // HuggingFace dataset format
const VISION_IMAGES_DIR = join(VISION_DATASET_DIR, 'images'); // Images subdirectory

// --- Log File Paths ---
const REASONING_LOG_FILE = join(LOGS_DIR, 'reasoning_logs.csv');
const NORMAL_LOG_FILE = join(LOGS_DIR, 'normal_logs.csv');
const VISION_METADATA_FILE = join(VISION_DATASET_DIR, 'metadata.jsonl'); // HF metadata format

// --- Log Headers ---
const TEXT_LOG_HEADER = 'input,output\n';

// --- Log Counters ---
let logCounts = {
    normal: 0,
    reasoning: 0,
    vision: 0,
    total: 0,
    skipped_disabled: 0,
    skipped_empty: 0,
    vision_images_saved: 0,
};

// --- Helper Functions ---
function ensureDirectoryExistence(dirPath) {
    if (!existsSync(dirPath)) {
        try {
            mkdirSync(dirPath, { recursive: true });
            console.log(`[Logger] Created directory: ${dirPath}`);
        } catch (error) {
            console.error(`[Logger] Error creating directory ${dirPath}:`, error);
            return false;
        }
    }
    return true;
}

function countLogEntries(logFile) {
    if (!existsSync(logFile)) return 0;
    try {
        const data = readFileSync(logFile, 'utf8');
        const lines = data.split('\n').filter(line => line.trim());
        // Check if the first line looks like a header before subtracting
        const hasHeader = lines.length > 0 && lines[0].includes(',');
        return Math.max(0, hasHeader ? lines.length - 1 : lines.length);
    } catch (err) {
        console.error(`[Logger] Error reading log file ${logFile}:`, err);
        return 0;
    }
}


function ensureLogFile(logFile, header) {
     if (!ensureDirectoryExistence(path.dirname(logFile))) return false; // Ensure parent dir exists

     if (!existsSync(logFile)) {
        try {
            writeFileSync(logFile, header);
            console.log(`[Logger] Created log file: ${logFile}`);
        } catch (error) {
            console.error(`[Logger] Error creating log file ${logFile}:`, error);
            return false;
        }
    } else {
         try {
            const content = readFileSync(logFile, 'utf-8');
            const headerLine = header.split('\n')[0];
            // If file is empty or header doesn't match, overwrite/create header
            if (!content.trim() || !content.startsWith(headerLine)) {
                 // Attempt to prepend header if file has content but wrong/no header
                 if(content.trim() && !content.startsWith(headerLine)) {
                    console.warn(`[Logger] Log file ${logFile} seems to be missing or has an incorrect header. Prepending correct header.`);
                    writeFileSync(logFile, header + content);
                 } else {
                    // File is empty or correctly headed, just ensure header is there
                     writeFileSync(logFile, header);
                 }
                 console.log(`[Logger] Ensured header in log file: ${logFile}`);
            }
        } catch (error) {
            console.error(`[Logger] Error checking/writing header for log file ${logFile}:`, error);
            // Proceed cautiously, maybe log an error and continue?
        }
    }
    return true;
}


function writeToLogFile(logFile, csvEntry) {
    try {
        appendFileSync(logFile, csvEntry);
        // console.log(`[Logger] Logged data to ${logFile}`); // Keep console less noisy
    } catch (error) {
        console.error(`[Logger] Error writing to CSV log file ${logFile}:`, error);
    }
}

// --- Auto-Detection for Log Type (Based on Response Content) ---
function determineLogType(response) {
    // Reasoning check: needs <think>...</think> but ignore the specific 'undefined' placeholder
    const isReasoning = response.includes('<think>') && response.includes('</think>') && !response.includes('<think>\nundefined</think>');

    if (isReasoning) {
        return 'reasoning';
    } else {
        return 'normal';
    }
}

function sanitizeForCsv(value) {
    if (typeof value !== 'string') {
        value = String(value);
    }
    // Escape double quotes by doubling them and enclose the whole string in double quotes
    return `"${value.replace(/"/g, '""')}"`;
}

// Helper function to clean reasoning markers from input
function cleanReasoningMarkers(input) {
    if (typeof input !== 'string') {
        return input;
    }
    
    // Remove /think and /no_think markers
    return input.replace(/\/think/g, '').replace(/\/no_think/g, '').trim();
}

// Helper function to clean imagePath from messages for text logs
function cleanImagePathFromMessages(input) {
    if (typeof input !== 'string') {
        return input;
    }
    
    try {
        const parsed = JSON.parse(input);
        if (Array.isArray(parsed)) {
            const cleaned = parsed.map(msg => {
                let cleanedMsg = { ...msg }; // Clone message

                // Remove top-level imagePath
                if (cleanedMsg.imagePath !== undefined) {
                    delete cleanedMsg.imagePath;
                }

                // Remove image_url from content array
                if (Array.isArray(cleanedMsg.content)) {
                    cleanedMsg.content = cleanedMsg.content.filter(part => 
                        part.type !== 'image_url' && 
                        !(part.type === 'image' && part.source) // Also filter Claude-style image parts
                    );
                    
                    // If content becomes empty after filtering, remove it or set to empty string
                    if (cleanedMsg.content.length === 0) {
                        cleanedMsg.content = "";
                    } else if (cleanedMsg.content.length === 1 && 
                               cleanedMsg.content[0].type === 'text' && 
                               !cleanedMsg.content[0].text?.trim()) {
                        cleanedMsg.content = "";
                    }
                }
                return cleanedMsg;
            });
            return JSON.stringify(cleaned);
        }
    } catch (e) {
        // If not valid JSON, return as-is
        return input;
    }
    
    return input;
}

// --- Main Logging Function (for text-based input/output) ---
export function log(input, response) {
    const trimmedInputStr = input ? (typeof input === 'string' ? input.trim() : JSON.stringify(input)) : "";
    const trimmedResponse = response ? String(response).trim() : ""; // Ensure response is a string

    // Clean reasoning markers from input before logging
    let cleanedInput = cleanReasoningMarkers(trimmedInputStr);
    
    // Clean imagePath from messages for text logs (normal/reasoning)
    cleanedInput = cleanImagePathFromMessages(cleanedInput);

    // Basic filtering
    if (!cleanedInput && !trimmedResponse) {
        logCounts.skipped_empty++;
        return;
    }
    if (cleanedInput === trimmedResponse) {
         logCounts.skipped_empty++;
        return;
    }
     // Avoid logging common error messages that aren't useful training data
    const errorMessages = [
        "My brain disconnected, try again.",
        "My brain just kinda stopped working. Try again.",
        "I thought too hard, sorry, try again.",
        "*no response*",
        "No response received.",
        "No response data.",
        "Failed to send", // Broader match
        "Error:", // Broader match
        "Vision is only supported",
        "Context length exceeded",
        "Image input modality is not enabled",
        "An unexpected error occurred",
        // Add more generic errors/placeholders as needed
    ];
    // Also check for responses that are just the input repeated (sometimes happens with errors)
    if (errorMessages.some(err => trimmedResponse.includes(err)) || trimmedResponse === cleanedInput) {
        logCounts.skipped_empty++;
        // console.warn(`[Logger] Skipping log due to error/placeholder/repeat: "${trimmedResponse.substring(0, 70)}..."`);
        return;
    }


    const logType = determineLogType(trimmedResponse);
    let logFile;
    let header;
    let settingFlag;

    switch (logType) {
        case 'reasoning':
            logFile = REASONING_LOG_FILE;
            header = TEXT_LOG_HEADER;
            settingFlag = settings.log_reasoning_data;
            break;
        case 'normal':
        default:
            logFile = NORMAL_LOG_FILE;
            header = TEXT_LOG_HEADER;
            settingFlag = settings.log_normal_data;
            break;
    }

    // Check if logging for this type is enabled
    if (!settingFlag) {
        logCounts.skipped_disabled++;
        return;
    }

    // Ensure directory and file exist
    if (!ensureLogFile(logFile, header)) return; // ensureLogFile now checks parent dir too

    // Prepare the CSV entry using the sanitizer with cleaned input
    const safeInput = sanitizeForCsv(cleanedInput);
    const safeResponse = sanitizeForCsv(trimmedResponse);
    const csvEntry = `${safeInput},${safeResponse}\n`;

    // Write to the determined log file
    writeToLogFile(logFile, csvEntry);

    // Update counts
    logCounts[logType]++;
    logCounts.total++; // Total here refers to text logs primarily

    // Display summary periodically (based on total text logs)
    if (logCounts.normal + logCounts.reasoning > 0 && (logCounts.normal + logCounts.reasoning) % 20 === 0) {
       printSummary();
    }
}

// --- Enhanced Vision Logging Function for HuggingFace Dataset Format ---
export function logVision(conversationHistory, imageBuffer, response, visionMessage = null) {
    if (!settings.log_vision_data) {
        logCounts.skipped_disabled++;
        return;
    }

    const trimmedResponse = response ? String(response).trim() : "";
    
    if (!conversationHistory || conversationHistory.length === 0 || !trimmedResponse || !imageBuffer) {
        logCounts.skipped_empty++;
        return;
    }

    // Filter out error messages
    const errorMessages = [
        "My brain disconnected, try again.",
        "My brain just kinda stopped working. Try again.",
        "I thought too hard, sorry, try again.",
        "*no response*",
        "No response received.",
        "No response data.",
        "Failed to send",
        "Error:",
        "Vision is only supported",
        "Context length exceeded",
        "Image input modality is not enabled",
        "An unexpected error occurred",
        "Image captured for always active vision", // Filter out placeholder responses
    ];
    
    if (errorMessages.some(err => trimmedResponse.includes(err))) {
        logCounts.skipped_empty++;
        return;
    }

    // Ensure directories exist
    if (!ensureDirectoryExistence(VISION_DATASET_DIR)) return;
    if (!ensureDirectoryExistence(VISION_IMAGES_DIR)) return;

    try {
        // Generate unique filename for the image
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        const imageFilename = `vision_${timestamp}_${randomSuffix}.jpg`;
        const imagePath = join(VISION_IMAGES_DIR, imageFilename);
        const relativeImagePath = `images/${imageFilename}`; // Relative path for metadata

        // Save the image
        writeFileSync(imagePath, imageBuffer);
        logCounts.vision_images_saved++;

        // Clean the conversation history to remove imagePath and image data before logging
        const cleanedConversationHistory = JSON.parse(cleanImagePathFromMessages(JSON.stringify(conversationHistory)));
        
        // Format the complete input as JSON (cleaned conversation history)
        const inputData = JSON.stringify(cleanedConversationHistory);

        // Create metadata entry in JSONL format for HuggingFace
        const metadataEntry = {
            file_name: relativeImagePath,
            input: inputData, // Cleaned JSON conversation history
            response: trimmedResponse, // Actual model response, not placeholder
            timestamp: timestamp
        };

        // Append to metadata JSONL file
        const jsonlLine = JSON.stringify(metadataEntry) + '\n';
        appendFileSync(VISION_METADATA_FILE, jsonlLine);
        
        logCounts.vision++;
        logCounts.total++;

        // Display summary periodically
        if (logCounts.vision > 0 && logCounts.vision % 10 === 0) {
            printSummary();
        }

    } catch (error) {
        console.error(`[Logger] Error logging vision data:`, error);
    }
}

// Helper function to format conversation history as fallback
function formatConversationInput(conversationHistory) {
    if (!conversationHistory || conversationHistory.length === 0) return '';
    
    const formattedHistory = [];
    
    for (const turn of conversationHistory) {
        const formattedTurn = {
            role: turn.role || 'user',
            content: []
        };

        // Handle different content formats
        if (typeof turn.content === 'string') {
            formattedTurn.content.push({
                type: 'text',
                text: turn.content
            });
        } else if (Array.isArray(turn.content)) {
            // Already in the correct format
            formattedTurn.content = turn.content;
        } else if (turn.content && typeof turn.content === 'object') {
            // Convert object to array format
            if (turn.content.text) {
                formattedTurn.content.push({
                    type: 'text',
                    text: turn.content.text
                });
            }
            if (turn.content.image) {
                formattedTurn.content.push({
                    type: 'image',
                    image: turn.content.image
                });
            }
        }

        formattedHistory.push(formattedTurn);
    }
    
    return JSON.stringify(formattedHistory);
}

function printSummary() {
    const totalStored = logCounts.normal + logCounts.reasoning + logCounts.vision;
    console.log('\n' + '='.repeat(60));
    console.log('LOGGER SUMMARY');
    console.log('-'.repeat(60));
    console.log(`Normal logs stored:    ${logCounts.normal}`);
    console.log(`Reasoning logs stored: ${logCounts.reasoning}`);
    console.log(`Vision logs stored:    ${logCounts.vision} (Images saved: ${logCounts.vision_images_saved})`);
    console.log(`Skipped (disabled):    ${logCounts.skipped_disabled}`);
    console.log(`Skipped (empty/err):   ${logCounts.skipped_empty}`);
    console.log('-'.repeat(60));
    console.log(`Total logs stored:     ${totalStored}`);
    console.log('='.repeat(60) + '\n');
}

// Initialize counts at startup
function initializeCounts() {
    logCounts.normal = countLogEntries(NORMAL_LOG_FILE);
    logCounts.reasoning = countLogEntries(REASONING_LOG_FILE);
    logCounts.vision = countVisionEntries(VISION_METADATA_FILE);
    // Total count will be accumulated during runtime
    console.log(`[Logger] Initialized log counts: Normal=${logCounts.normal}, Reasoning=${logCounts.reasoning}, Vision=${logCounts.vision}`);
}

function countVisionEntries(metadataFile) {
    if (!existsSync(metadataFile)) return 0;
    try {
        const data = readFileSync(metadataFile, 'utf8');
        const lines = data.split('\n').filter(line => line.trim());
        return lines.length;
    } catch (err) {
        console.error(`[Logger] Error reading vision metadata file ${metadataFile}:`, err);
        return 0;
    }
}

// Initialize counts at startup
initializeCounts();
