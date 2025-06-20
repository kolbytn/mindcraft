import settings from '../../settings.js';
import { GroqCloudTTS } from '../models/groq.js';
import wav from 'wav';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Import getIO and our new function getAllInGameAgentNames
import { getIO, getAllInGameAgentNames } from '../server/mind_server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Import the audio libraries conditionally
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

// Configuration from settings
const RMS_THRESHOLD = settings.stt_rms_threshold || 8000;
const SILENCE_DURATION = settings.stt_silence_duration || 2000;
const MIN_AUDIO_DURATION = settings.stt_min_audio_duration || 0.5;
const MAX_AUDIO_DURATION = settings.stt_max_audio_duration || 15;
const DEBUG_AUDIO = settings.stt_debug_audio || false;
const COOLDOWN_MS = settings.stt_cooldown_ms || 2000;
const SPEECH_THRESHOLD_RATIO = settings.stt_speech_threshold_ratio || 0.15;
const CONSECUTIVE_SPEECH_SAMPLES = settings.stt_consecutive_speech_samples || 5;
const SAMPLE_RATE = 16000;
const BIT_DEPTH = 16;
const STT_USERNAME = settings.stt_username || "SERVER";
const STT_AGENT_NAME = settings.stt_agent_name || "";

// Guards to prevent multiple overlapping recordings
let isRecording = false;
let sttRunning = false;
let sttInitialized = false;
let lastRecordingEndTime = 0;

async function recordAndTranscribeOnce() {
  // Check cooldown period
  const timeSinceLastRecording = Date.now() - lastRecordingEndTime;
  if (timeSinceLastRecording < COOLDOWN_MS) {
    return null;
  }

  // If another recording is in progress, just skip
  if (isRecording) {
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
    console.warn("[STT] No audio recording library available.");
    isRecording = false;
    return null;
  }

  let audioInterface;
  let audioStream;
  let recording = true;
  let hasHeardSpeech = false;
  let silenceTimer = null;
  let maxDurationTimer = null;
  let finished = false;
  
  // Smart speech detection variables
  let speechSampleCount = 0;
  let totalSampleCount = 0;
  let consecutiveSpeechSamples = 0;
  let speechLevels = [];
  let averageSpeechLevel = 0;
  let adaptiveThreshold = RMS_THRESHOLD;

  // Helper to reset silence timer
  function resetSilenceTimer() {
    if (silenceTimer) clearTimeout(silenceTimer);
    // Only start silence timer if actual speech has been detected
    if (hasHeardSpeech && recording) { // also check `recording` to prevent timer after explicit stop
        silenceTimer = setTimeout(() => {
            if (DEBUG_AUDIO) console.log('[STT] Silence timeout reached, stopping recording.');
            stopRecording();
        }, SILENCE_DURATION);
    }
  }

  // Stop recording
  function stopRecording() {
    if (!recording) return;
    recording = false;

    if (silenceTimer) clearTimeout(silenceTimer);
    if (maxDurationTimer) clearTimeout(maxDurationTimer);

    if (activeAudioLibrary === 'naudiodon' && audioInterface) {
      try {
        audioInterface.quit();
      } catch (err) {
        // Silent error handling
      }
    } else if (activeAudioLibrary === 'mic' && audioInterface) {
      try {
        audioInterface.stop();
      } catch (err) {
        // Silent error handling
      }
    }

    if (fileWriter && !fileWriter.closed) {
      fileWriter.end();
    }
  }

  // We wrap everything in a promise so we can await the transcription
  return new Promise((resolve, reject) => {
    // Set maximum recording duration timer
    maxDurationTimer = setTimeout(() => {
      stopRecording();
    }, MAX_AUDIO_DURATION * 1000);

    if (activeAudioLibrary === 'naudiodon') {
      if (!AudioIO || !SampleFormat16Bit) {
          isRecording = false;
          return reject(new Error("Naudiodon not available"));
      }
      audioInterface = new AudioIO({
        inOptions: {
          channelCount: 1,
          sampleFormat: SampleFormat16Bit,
          sampleRate: SAMPLE_RATE,
          deviceId: -1,
          closeOnError: true
        }
      });
      audioStream = audioInterface;

      audioStream.on('error', (err) => {
        cleanupAndResolve(null);
      });

    } else if (activeAudioLibrary === 'mic') {
      audioInterface = new mic({
        rate: String(SAMPLE_RATE),
        channels: '1',
        bitwidth: String(BIT_DEPTH),
        endian: 'little',
        encoding: 'signed-integer',
        device: 'default',
        debug: false // Don't use mic's debug, we have our own
      });
      audioStream = audioInterface.getAudioStream();

      audioStream.on('error', (err) => {
        cleanupAndResolve(null);
      });

      audioStream.on('processExitComplete', () => {
        // Silent
      });
    }

    // Common event handling for data (applies to both naudiodon ai and micStream)
    audioStream.on('data', (chunk) => {
      if (!recording) return;

      fileWriter.write(chunk);

      // Calculate RMS for threshold detection
      let sumSquares = 0;
      const sampleCount = chunk.length / 2;
      for (let i = 0; i < chunk.length; i += 2) {
        const sample = chunk.readInt16LE(i);
        sumSquares += sample * sample;
      }
      const rms = Math.sqrt(sumSquares / sampleCount);
      totalSampleCount++;

      // Simplified speech detection logic
      if (rms > adaptiveThreshold) {
        speechSampleCount++;
        consecutiveSpeechSamples++;
        speechLevels.push(rms);
        
        // Update adaptive threshold based on actual speech levels
        if (speechLevels.length > 10) {
          averageSpeechLevel = speechLevels.reduce((a, b) => a + b, 0) / speechLevels.length;
          adaptiveThreshold = Math.max(RMS_THRESHOLD, averageSpeechLevel * 0.4); // 40% of average speech level
        }
        
        // Trigger speech detection much more easily
        if (!hasHeardSpeech) {
          // Either consecutive samples OR sufficient ratio
          const speechRatio = speechSampleCount / totalSampleCount;
          if (consecutiveSpeechSamples >= 3 || speechRatio >= 0.05) { // Much lower thresholds
            hasHeardSpeech = true;
            console.log(`[STT] Speech detected! (consecutive: ${consecutiveSpeechSamples}, ratio: ${(speechRatio * 100).toFixed(1)}%)`);
          }
        }
        
        if (hasHeardSpeech) {
          resetSilenceTimer();
        }
      } else {
        consecutiveSpeechSamples = 0; // Reset consecutive counter
      }
    });

    fileWriter.on('finish', async () => {
      if (finished) return;
      finished = true;
      lastRecordingEndTime = Date.now();
      
      try {
        const stats = fs.statSync(outFile);
        const headerSize = 44;
        const dataSize = stats.size - headerSize;
        const duration = dataSize / (SAMPLE_RATE * (BIT_DEPTH / 8));
        
        const speechPercentage = totalSampleCount > 0 ? (speechSampleCount / totalSampleCount) * 100 : 0;

        if (DEBUG_AUDIO) {
          console.log(`[STT] Audio processed: ${duration.toFixed(2)}s, speech detected: ${hasHeardSpeech}, speech %: ${speechPercentage.toFixed(1)}%`);
        }

        if (duration < MIN_AUDIO_DURATION) {
          cleanupAndResolve(null);
          return;
        }

        if (!hasHeardSpeech || speechPercentage < 3) { // Lowered from 15% to 3%
          cleanupAndResolve(null);
          return;
        }

        const groqTTS = new GroqCloudTTS();
        const text = await groqTTS.transcribe(outFile, {
          model: "distil-whisper-large-v3-en",
          prompt: "",
          response_format: "json",
          language: "en",
          temperature: 0.0
        });

        if (!text || !text.trim()) {
          cleanupAndResolve(null);
          return;
        }

        // Enhanced validation
        if (!/[A-Za-z]/.test(text)) {
          cleanupAndResolve(null);
          return;
        }

        if (/([A-Za-z])\1{3,}/.test(text)) {
          cleanupAndResolve(null);
          return;
        }

        // Filter out common false positives
        const falsePositives = ["thank you", "thanks", "bye", ".", ",", "?", "!", "um", "uh", "hmm"];
        if (falsePositives.includes(text.trim().toLowerCase())) {
          cleanupAndResolve(null);
          return;
        }

        const letterCount = text.replace(/[^A-Za-z]/g, "").length;
        const normalizedText = text.trim().toLowerCase();
        const allowedGreetings = new Set(["hi", "hello", "hey", "yes", "no", "okay"]);

        if (letterCount < 2 && !allowedGreetings.has(normalizedText)) {
          cleanupAndResolve(null);
          return;
        }

        // Only log successful transcriptions
        console.log("[STT] Transcribed:", text);

        const finalMessage = `[${STT_USERNAME}] ${text}`;

        if (!STT_AGENT_NAME.trim()) {
          const agentNames = getAllInGameAgentNames();
          for (const agentName of agentNames) {
            getIO().emit('send-message', agentName, finalMessage);
          }
        } else {
          getIO().emit('send-message', STT_AGENT_NAME, finalMessage);
        }

        cleanupAndResolve(text);
      } catch (err) {
        cleanupAndResolve(null);
      }
    });

    function cleanupAndResolve(result) {
      if (silenceTimer) clearTimeout(silenceTimer);
      if (maxDurationTimer) clearTimeout(maxDurationTimer);
      
      try {
        if (fs.existsSync(outFile)) {
          fs.unlinkSync(outFile);
        }
      } catch (err) {
        // Silent cleanup
      }

      if (audioStream && typeof audioStream.removeAllListeners === 'function') {
        audioStream.removeAllListeners();
      }
      if (fileWriter && typeof fileWriter.removeAllListeners === 'function') {
        fileWriter.removeAllListeners();
      }

      isRecording = false;
      resolve(result);
    }

    // Start recording
    try {
      if (activeAudioLibrary === 'naudiodon') {
        audioInterface.start();
      } else if (activeAudioLibrary === 'mic') {
        audioInterface.start();
      }
    } catch (err) {
      cleanupAndResolve(null);
    }
  });
}

/**
 * Runs recording sessions sequentially, so only one at a time
 */
async function continuousLoop() {
  if (!activeAudioLibrary) {
    console.warn("[STT] No audio recording library available. STT disabled.");
    sttRunning = false;
    return;
  }

  console.log("[STT] Speech-to-text active (Groq Whisper)");
  let consecutiveErrors = 0;
  const maxConsecutiveErrors = 3;

  while (sttRunning) {
    try {
      const result = await recordAndTranscribeOnce();
      consecutiveErrors = 0;
      
      // Longer delay between recordings
      if (sttRunning) {
        await new Promise(res => setTimeout(res, 1000));
      }
    } catch (err) {
      consecutiveErrors++;
      
      if (consecutiveErrors >= maxConsecutiveErrors) {
        console.error("[STT] Too many errors, stopping STT.");
        sttRunning = false;
        break;
      }
      
      if (sttRunning) {
        const delay = 3000 * consecutiveErrors;
        await new Promise(res => setTimeout(res, delay));
      }
    }
  }
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

  if (sttRunning || sttInitialized) {
    console.log("[STT] STT already initialized; skipping re-init.");
    return;
  }

  console.log("[STT] Initializing STT...");
  sttRunning = true;
  sttInitialized = true;

  setTimeout(() => {
    continuousLoop().catch((err) => {
      console.error("[STT] continuousLoop crashed unexpectedly:", err);
      sttRunning = false;
      sttInitialized = false;
    });
  }, 2000);
}
