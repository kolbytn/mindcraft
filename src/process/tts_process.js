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
let mic; // For mic library
let activeAudioLibrary = null; // 'naudiodon' or 'mic'

(async () => {
    try {
        const naudiodonModule = await import('naudiodon');
        portAudio = naudiodonModule.default;
        if (portAudio && typeof portAudio.AudioIO === 'function' && typeof portAudio.SampleFormat16Bit !== 'undefined') {
            AudioIO = portAudio.AudioIO;
            SampleFormat16Bit = portAudio.SampleFormat16Bit;
            activeAudioLibrary = 'naudiodon';
            console.log('[STT] naudiodon loaded successfully.');
        } else if (naudiodonModule.AudioIO && typeof naudiodonModule.SampleFormat16Bit !== 'undefined') {
            AudioIO = naudiodonModule.AudioIO;
            SampleFormat16Bit = naudiodonModule.SampleFormat16Bit;
            portAudio = naudiodonModule;
            activeAudioLibrary = 'naudiodon';
            console.log('[STT] naudiodon loaded successfully (direct properties).');
        } else {
            throw new Error('AudioIO or SampleFormat16Bit not found in naudiodon module exports.');
        }
    } catch (err) {
        console.warn(`[STT] Failed to load naudiodon. Error: ${err.message}`);
        portAudio = null;
        AudioIO = null;
        SampleFormat16Bit = null;

        // Attempt to load mic if naudiodon fails
        try {
            const micModule = await import('mic');
            mic = micModule.default; // Assuming mic is also a CommonJS module typically
            if (mic && typeof mic === 'function') { // mic is often a constructor function
                 activeAudioLibrary = 'mic';
                 console.log('[STT] mic loaded successfully as an alternative.');
            } else if (micModule.Mic) { // Some modules might export it as Mic
                mic = micModule.Mic;
                activeAudioLibrary = 'mic';
                console.log('[STT] mic (Mic) loaded successfully as an alternative.');
            }
            else {
                throw new Error('Mic constructor not found in mic module exports.');
            }
        } catch (micErr) {
            console.warn(`[STT] Failed to load mic as well. Speech-to-Text will be disabled. Error: ${micErr.message}`);
            mic = null;
            activeAudioLibrary = null;
        }
    }
    // Initialize TTS after attempting to load audio libraries
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

  if (!activeAudioLibrary) {
    console.warn("[STT] No audio recording library available (naudiodon or mic). Cannot record audio.");
    isRecording = false;
    return null;
  }

  let audioInterface; // Will hold either naudiodon's 'ai' or mic's 'micInstance'
  let audioStream;    // Will hold either naudiodon's 'ai' or mic's 'micInputStream'

  let recording = true;
  let hasHeardSpeech = false;
  let silenceTimer = null;
  let finished = false; // Guard to ensure final processing is done only once

  // Helper to reset silence timer
  function resetSilenceTimer() {
    if (silenceTimer) clearTimeout(silenceTimer);
    // Only start silence timer if actual speech has been detected
    if (hasHeardSpeech && recording) { // also check `recording` to prevent timer after explicit stop
        silenceTimer = setTimeout(() => {
            console.log('[STT] Silence detected, stopping recording.');
            stopRecording();
        }, SILENCE_DURATION);
    }
  }

  // Stop recording
  function stopRecording() {
    if (!recording) return;
    console.log('[STT] stopRecording called.');
    recording = false; // Set recording to false immediately

    if (activeAudioLibrary === 'naudiodon' && audioInterface) {
      audioInterface.quit();
    } else if (activeAudioLibrary === 'mic' && audioInterface) {
      audioInterface.stop(); // micInstance.stop()
    }
    // fileWriter.end() will be called by the 'finish' or 'silence' event handlers
    // to ensure all data is written before closing the file.
    // However, if stopRecording is called externally (e.g. by SILENCE_DURATION timer)
    // and not by an event that naturally ends the stream, we might need to end it here.
    // Let's defer fileWriter.end() to specific event handlers for now,
    // but if issues arise, this is a place to check.
    // For now, we rely on 'silence' (mic) or 'quit' sequence (naudiodon) to close writer.
  }


  // We wrap everything in a promise so we can await the transcription
  return new Promise((resolve, reject) => {
    if (activeAudioLibrary === 'naudiodon') {
      if (!AudioIO || !SampleFormat16Bit) { // Should have been caught by activeAudioLibrary check, but for safety
          console.warn("[STT] Naudiodon not available for recording.");
          isRecording = false;
          return reject(new Error("Naudiodon not available"));
      }
      audioInterface = new AudioIO({ // Naudiodon's ai
        inOptions: {
          channelCount: 1,
          sampleFormat: SampleFormat16Bit,
          sampleRate: SAMPLE_RATE,
          deviceId: -1, // Default device
          closeOnError: true
        }
      });
      audioStream = audioInterface; // For naudiodon, the interface itself is the stream emitter

      audioStream.on('error', (err) => {
        console.error("[STT] Naudiodon AudioIO error:", err);
        stopRecording(); // Try to stop everything
        fileWriter.end(() => fs.unlink(outFile, () => {})); // End writer and delete file
        cleanupListeners();
        resolve(null); // Resolve with null as per existing logic for continuousLoop
      });

    } else if (activeAudioLibrary === 'mic') {
      // Calculate exitOnSilence for mic. It's in number of 512-byte chunks.
      // Each chunk is 256 samples (16-bit, so 2 bytes per sample).
      // Duration of one chunk = 256 samples / SAMPLE_RATE seconds.
      // Number of chunks for SILENCE_DURATION:
      // (SILENCE_DURATION / 1000) / (256 / SAMPLE_RATE)
      const micExitOnSilence = Math.ceil((SILENCE_DURATION / 1000) * (SAMPLE_RATE / 256));
      console.log(`[STT] Mic exitOnSilence calculated to: ${micExitOnSilence} frames (for ${SILENCE_DURATION}ms)`);

      audioInterface = new mic({ // micInstance
        rate: String(SAMPLE_RATE),
        channels: '1',
        bitwidth: String(BIT_DEPTH),
        endian: 'little',
        encoding: 'signed-integer',
        device: 'default', // Or settings.audio_input_device
        exitOnSilence: micExitOnSilence, // This will trigger 'silence' event
        debug: false // settings.debug_audio || false
      });
      audioStream = audioInterface.getAudioStream();

      audioStream.on('error', (err) => {
        console.error('[STT] Mic error:', err);
        stopRecording();
        fileWriter.end(() => fs.unlink(outFile, () => {}));
        cleanupListeners();
        resolve(null);
      });

      audioStream.on('silence', () => {
        console.log('[STT] Mic detected silence.');
        // stopRecording(); // This will call micInstance.stop()
                           // which then triggers processExitComplete.
                           // Redundant if exitOnSilence is working as expected.
                           // Let's ensure stopRecording is called to clear timers etc.
        if (recording) { // Only call stop if we haven't already stopped for other reasons
            stopRecording();
        }
        // Important: mic automatically stops on silence. We need to ensure fileWriter is closed.
        if (fileWriter && !fileWriter.closed) {
            fileWriter.end(); // This will trigger 'finish' on fileWriter
        }
      });

      audioStream.on('processExitComplete', () => {
        console.log('[STT] Mic processExitComplete.');
        // This indicates mic has fully stopped.
        // Ensure fileWriter is ended if not already.
        if (fileWriter && !fileWriter.closed) {
            console.log('[STT] Mic processExitComplete: Ending fileWriter.');
            fileWriter.end();
        }
        // isRecording should be set to false by stopRecording()
      });
    }

    // Common event handling for data (applies to both naudiodon ai and micStream)
    audioStream.on('data', (chunk) => {
      if (!recording) return; // Don't process data if no longer recording

      fileWriter.write(chunk);

      // Calculate RMS for threshold detection (same logic for both libraries)
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

    // fileWriter.on('finish', ...) remains largely the same but moved outside library-specific setup
    // }); // This was part of ai.on('data', ...) which is now common code block.

    // This was ai.on('error',...) specific to naudiodon, now handled above.
    // });

    fileWriter.on('finish', async () => {
      console.log('[STT] FileWriter finished.');
      if (finished) return;
      finished = true;

      // Ensure recording is marked as stopped and lock released
      isRecording = false;
      if (silenceTimer) clearTimeout(silenceTimer);
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

    // Start the appropriate audio input
    if (activeAudioLibrary === 'naudiodon') {
      audioInterface.start();
    } else if (activeAudioLibrary === 'mic') {
      audioInterface.start();
    }

    function cleanupListeners() {
      if (audioStream && typeof audioStream.removeAllListeners === 'function') {
        audioStream.removeAllListeners('data');
        audioStream.removeAllListeners('error');
        if (activeAudioLibrary === 'mic') {
          audioStream.removeAllListeners('silence');
          audioStream.removeAllListeners('processExitComplete');
        }
      }
      if (fileWriter && typeof fileWriter.removeAllListeners === 'function') {
        fileWriter.removeAllListeners('finish');
      }
      if (silenceTimer) clearTimeout(silenceTimer);

      // release lock if it hasn't been released by fileWriter.on('finish')
      // This is a safeguard.
      isRecording = false;
    }
  });
}

/**
 * Runs recording sessions sequentially, so only one at a time
 */
async function continuousLoop() {
  if (!activeAudioLibrary) {
    console.warn("[STT] No audio recording library available. STT continuous loop cannot start.");
    sttRunning = false;
    return;
  }

  while (sttRunning) {
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
    sttRunning = false;
    return;
  }

  if (!activeAudioLibrary) {
    console.warn("[STT] No audio recording library available (naudiodon or mic failed to load). STT functionality cannot be initialized.");
    sttRunning = false;
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
