import settings from '../../settings.js';
import { GroqCloudTTS } from '../models/groq.js';
import portAudio from 'naudiodon';
const { AudioIO, SampleFormat16Bit } = portAudio;
import wav from 'wav';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Import getIO and our new function getAllInGameAgentNames
import { getIO, getAllInGameAgentNames } from '../server/mind_server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    console.log("Another recording is still in progress; skipping new record attempt.");
    return null;
  }
  isRecording = true;

  const outFile = path.join(__dirname, `speech_${Date.now()}.wav`);
  const fileWriter = new wav.FileWriter(outFile, {
    channels: 1,
    sampleRate: SAMPLE_RATE,
    bitDepth: BIT_DEPTH
  });
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
      cleanupListeners();
      reject(err);
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
          console.log("Audio too short (<2.75s); discarding.");
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
          console.log("Transcription empty; discarding.");
          cleanupListeners();
          return resolve(null);
        }

        // Heuristic checks to determine if the transcription is genuine
        
        // 1. Ensure at least one alphabetical character
        if (!/[A-Za-z]/.test(text)) {
          console.log("Transcription has no letters; discarding.");
          cleanupListeners();
          return resolve(null);
        }

        // 2. Check for gibberish repeated sequences
        if (/([A-Za-z])\1{3,}/.test(text)) {
          console.log("Transcription looks like gibberish; discarding.");
          cleanupListeners();
          return resolve(null);
        }

        // 3. Check transcription length, with allowed greetings
        const letterCount = text.replace(/[^A-Za-z]/g, "").length;
        const normalizedText = text.trim().toLowerCase();
        const allowedGreetings = new Set(["hi", "hello", "greetings", "hey"]);

        if (letterCount < 8 && !allowedGreetings.has(normalizedText)) {
          console.log("Transcription too short and not an allowed greeting; discarding.");
          cleanupListeners();
          return resolve(null);
        }

        console.log("Transcription:", text);

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
        cleanupListeners();
        reject(err);
      }
    });

    ai.start();

    function cleanupListeners() {
      ai.removeAllListeners('data');
      ai.removeAllListeners('error');
      fileWriter.removeAllListeners('finish');
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
  while (true) {
    try {
      await recordAndTranscribeOnce();
    } catch (err) {
      console.error("[STT Error]", err);
    }
    // short gap
    await new Promise(res => setTimeout(res, 1000));
  }
}

export function initTTS() {
  // Only run if stt_transcription is true and we haven't started already
  if (!settings.stt_transcription) return;

  if (sttRunning) {
    console.log("STT loop already running; skipping re-init.");
    return;
  }
  sttRunning = true;

  continuousLoop().catch((err) => {
    console.error("[STT] continuousLoop crashed", err);
  });
}

initTTS();
