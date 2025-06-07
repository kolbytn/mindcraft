import settings from '../../settings.js';
import { GroqCloudTTS } from '../models/groq.js';
// import portAudio from 'naudiodon'; // Original static import
// const { AudioIO, SampleFormat16Bit } = portAudio; // Original destructuring
import wav from 'wav';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Import getIO and our new function getAllInGameAgentNames
import { getIO, getAllInGameAgentNames } from '../server/mind_server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Conditional Naudiodon Import ---
let portAudio;
let AudioIO;
let SampleFormat16Bit;

(async () => {
    try {
        const naudiodonModule = await import('naudiodon');
        portAudio = naudiodonModule.default; // CommonJS modules often export functionality on 'default' when imported into ES modules
        if (portAudio && typeof portAudio.AudioIO === 'function' && typeof portAudio.SampleFormat16Bit !== 'undefined') {
            AudioIO = portAudio.AudioIO;
            SampleFormat16Bit = portAudio.SampleFormat16Bit;
            console.log('[STT] naudiodon loaded successfully.');
        } else if (naudiodonModule.AudioIO && typeof naudiodonModule.SampleFormat16Bit !== 'undefined') {
            // Fallback if 'default' is not used and properties are directly on the module
            AudioIO = naudiodonModule.AudioIO;
            SampleFormat16Bit = naudiodonModule.SampleFormat16Bit;
            portAudio = naudiodonModule; // Assign the module itself to portAudio for consistency if needed elsewhere
            console.log('[STT] naudiodon loaded successfully (direct properties).');
        }
        else {
            throw new Error('AudioIO or SampleFormat16Bit not found in naudiodon module exports.');
        }
    } catch (err) {
        console.warn(`[STT] Failed to load naudiodon, Speech-to-Text will be disabled. Error: ${err.message}`);
        portAudio = null;
        AudioIO = null;
        SampleFormat16Bit = null;
    }
    // Initialize TTS after attempting to load naudiodon
    initTTS();
})();


/**
 * Delete leftover speech_*.wav from previous runs
 */
const leftover = fs.readdirSync(__dirname).filter(f => /^speech_\d+\.wav$/.test(f));
for (const file of leftover) {
  try {
    fs.unlinkSync(path.join(__dirname, file));
  } catch (_) {
    // ignore errors
  }
}

// Configuration
const RMS_THRESHOLD = 500;     // Lower threshold for faint audio
const SILENCE_DURATION = 2000; // 2 seconds of silence after speech => stop
const SAMPLE_RATE = 16000;
const BIT_DEPTH = 16;
const STT_USERNAME = settings.stt_username || "SERVER"; // Name that appears as sender
const STT_AGENT_NAME = settings.stt_agent_name || "";   // If blank, broadcast to all

// Guards to prevent multiple overlapping recordings
let isRecording = false;  // Ensures only one recordAndTranscribeOnce at a time
let sttRunning = false;   // Ensures continuousLoop is started only once

/**
 * Records one session, transcribes, and sends to MindServer as a chat message
 */
async function recordAndTranscribeOnce() {
  // If another recording is in progress, just skip
  if (isRecording) {
    console.log("[STT] Another recording is still in progress; skipping new record attempt.");
    return null;
  }
  isRecording = true;

  const outFile = path.join(__dirname, `speech_${Date.now()}.wav`);
  const fileWriter = new wav.FileWriter(outFile, {
    channels: 1,
    sampleRate: SAMPLE_RATE,
    bitDepth: BIT_DEPTH
  });

  // This is where AudioIO is crucial
  if (!AudioIO || !SampleFormat16Bit) {
      console.warn("[STT] AudioIO or SampleFormat16Bit not available. Cannot record audio.");
      isRecording = false;
      return null;
  }

  const ai = new AudioIO({
    inOptions: {
      channelCount: 1,
      sampleFormat: SampleFormat16Bit,
      sampleRate: SAMPLE_RATE,
      deviceId: -1,
      closeOnError: true
    }
  });

  let recording = true;
  let hasHeardSpeech = false;
  let silenceTimer = null;
  let finished = false; // Guard to ensure final processing is done only once

  // Helper to reset silence timer
  function resetSilenceTimer() {
    if (silenceTimer) clearTimeout(silenceTimer);
    if (hasHeardSpeech) {
      silenceTimer = setTimeout(() => stopRecording(), SILENCE_DURATION);
    }
  }

  // Stop recording
  function stopRecording() {
    if (!recording) return;
    recording = false;
    ai.quit();
    fileWriter.end();
  }

  // We wrap everything in a promise so we can await the transcription
  return new Promise((resolve, reject) => {
    // Attach event handlers
    ai.on('data', (chunk) => {
      fileWriter.write(chunk);

      // Calculate RMS for threshold detection
      let sumSquares = 0;
      const sampleCount = chunk.length / 2;
      for (let i = 0; i < chunk.length; i += 2) {
        const sample = chunk.readInt16LE(i);
        sumSquares += sample * sample;
      }
      const rms = Math.sqrt(sumSquares / sampleCount);

      // If RMS passes threshold, we've heard speech
      if (rms > RMS_THRESHOLD) {
        if (!hasHeardSpeech) {
          hasHeardSpeech = true;
        }
        resetSilenceTimer();
      }
    });

    ai.on('error', (err) => {
      console.error("[STT] AudioIO error:", err);
      cleanupListeners();
      // Don't reject here, as continuousLoop should continue. Resolve with null.
      resolve(null);
    });

    fileWriter.on('finish', async () => {
      if (finished) return;
      finished = true;
      try {
        // Check audio duration
        const stats = fs.statSync(outFile);
        const headerSize = 44; // standard WAV header size
        const dataSize = stats.size - headerSize;
        const duration = dataSize / (SAMPLE_RATE * (BIT_DEPTH / 8));
        if (duration < 2.75) {
          console.log("[STT] Audio too short (<2.75s); discarding.");
          fs.unlink(outFile, () => {});
          cleanupListeners();
          return resolve(null);
        }

        // Transcribe
        const groqTTS = new GroqCloudTTS();
        const text = await groqTTS.transcribe(outFile, {
          model: "distil-whisper-large-v3-en",
          prompt: "",
          response_format: "json",
          language: "en",
          temperature: 0.0
        });

        fs.unlink(outFile, () => {}); // cleanup WAV file

        // Basic check for empty or whitespace
        if (!text || !text.trim()) {
          console.log("[STT] Transcription empty; discarding.");
          cleanupListeners();
          return resolve(null);
        }

        // Heuristic checks to determine if the transcription is genuine

        // 1. Ensure at least one alphabetical character
        if (!/[A-Za-z]/.test(text)) {
          console.log("[STT] Transcription has no letters; discarding.");
          cleanupListeners();
          return resolve(null);
        }

        // 2. Check for gibberish repeated sequences
        if (/([A-Za-z])\1{3,}/.test(text)) {
          console.log("[STT] Transcription looks like gibberish; discarding.");
          cleanupListeners();
          return resolve(null);
        }

        // 3. Check transcription length, with allowed greetings
        const letterCount = text.replace(/[^A-Za-z]/g, "").length;
        const normalizedText = text.trim().toLowerCase();
        const allowedGreetings = new Set(["hi", "hello", "greetings", "hey"]);

        if (letterCount < 8 && !allowedGreetings.has(normalizedText)) {
          console.log("[STT] Transcription too short and not an allowed greeting; discarding.");
          cleanupListeners();
          return resolve(null);
        }

        console.log("[STT] Transcription:", text);

        // Format message so it looks like: "[SERVER] message"
        const finalMessage = `[${STT_USERNAME}] ${text}`;

        // If STT_AGENT_NAME is empty, broadcast to all agents
        if (!STT_AGENT_NAME.trim()) {
          const agentNames = getAllInGameAgentNames(); // from mind_server
          for (const agentName of agentNames) {
            getIO().emit('send-message', agentName, finalMessage);
          }
        } else {
          // Otherwise, send only to the specified agent
          getIO().emit('send-message', STT_AGENT_NAME, finalMessage);
        }

        cleanupListeners();
        resolve(text);
      } catch (err) {
        console.error("[STT] Error during transcription or sending message:", err);
        fs.unlink(outFile, () => {}); // Attempt cleanup even on error
        cleanupListeners();
        reject(err); // Propagate error for continuousLoop to catch
      }
    });

    ai.start();

    function cleanupListeners() {
      if (ai && typeof ai.removeAllListeners === 'function') {
        ai.removeAllListeners('data');
        ai.removeAllListeners('error');
      }
      if (fileWriter && typeof fileWriter.removeAllListeners === 'function') {
        fileWriter.removeAllListeners('finish');
      }
      if (silenceTimer) clearTimeout(silenceTimer);

      // release lock
      isRecording = false;
    }
  });
}

/**
 * Runs recording sessions sequentially, so only one at a time
 */
async function continuousLoop() {
  // This check is now more critical as AudioIO might not be available
  if (!AudioIO) {
    console.warn("[STT] AudioIO not available. STT continuous loop cannot start.");
    sttRunning = false; // Ensure this is marked as not running
    return;
  }

  while (sttRunning) { // Check sttRunning to allow loop to terminate if STT is disabled later
    try {
      await recordAndTranscribeOnce();
    } catch (err) {
      // Errors from recordAndTranscribeOnce (like transcription errors) are caught here
      console.error("[STT Error in continuousLoop]", err);
      // Potentially add a longer delay or a backoff mechanism if errors are persistent
    }
    // short gap, but only if stt is still supposed to be running
    if (sttRunning) {
      await new Promise(res => setTimeout(res, 1000));
    }
  }
  console.log("[STT] Continuous loop ended.");
}

export function initTTS() {
  if (!settings.stt_transcription) {
    console.log("[STT] STT transcription is disabled in settings.");
    sttRunning = false; // Ensure it's marked as not running
    return;
  }

  // This check is crucial: if AudioIO (from naudiodon) wasn't loaded, STT cannot run.
  if (!AudioIO) {
    console.warn("[STT] AudioIO is not available (naudiodon might have failed to load). STT functionality cannot be initialized.");
    sttRunning = false; // Ensure sttRunning is false if it was somehow true
    return;
  }

  if (sttRunning) {
    console.log("[STT] STT loop already running; skipping re-init.");
    return;
  }

  console.log("[STT] Initializing STT...");
  sttRunning = true; // Set before starting the loop

  continuousLoop().catch((err) => {
    console.error("[STT] continuousLoop crashed unexpectedly:", err);
    sttRunning = false; // Mark as not running if it crashes
  });
}

// Moved initTTS() call into the async IIFE after naudiodon import attempt.
// initTTS();
