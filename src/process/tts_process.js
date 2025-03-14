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
const RMS_THRESHOLD = 500;          // Lower threshold for faint audio
const SILENCE_DURATION = 2000;      // 2 seconds of silence after speech => stop
const SAMPLE_RATE = 16000;
const BIT_DEPTH = 16;
const STT_USERNAME = settings.stt_username || "SERVER";        // Name that appears as sender
const STT_AGENT_NAME = settings.stt_agent_name || "";          // If blank, broadcast to all

/**
 * Records one session, transcribes, and sends to MindServer as a chat message
 */
function recordAndTranscribeOnce() {
  return new Promise((resolve, reject) => {
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

    function resetSilenceTimer() {
      if (silenceTimer) clearTimeout(silenceTimer);
      if (hasHeardSpeech) {
        silenceTimer = setTimeout(() => stopRecording(), SILENCE_DURATION);
      }
    }

    function stopRecording() {
      if (!recording) return;
      recording = false;
      ai.quit();
      fileWriter.end();
    }

    ai.on('data', (chunk) => {
      fileWriter.write(chunk);

      // Calculate RMS
      let sumSquares = 0;
      const sampleCount = chunk.length / 2;
      for (let i = 0; i < chunk.length; i += 2) {
        const sample = chunk.readInt16LE(i);
        sumSquares += sample * sample;
      }
      const rms = Math.sqrt(sumSquares / sampleCount);

      if (rms > RMS_THRESHOLD) {
        if (!hasHeardSpeech) {
          hasHeardSpeech = true;
        }
        resetSilenceTimer();
      }
    });

    ai.on('error', (err) => {
      reject(err);
    });

    // Once the WAV file is finalized, transcribe
    fileWriter.on('finish', async () => {
      try {
        const groqTTS = new GroqCloudTTS();
        const text = await groqTTS.transcribe(outFile, {
          model: "distil-whisper-large-v3-en",
          prompt: "",
          response_format: "json",
          language: "en",
          temperature: 0.0
        });

        fs.unlink(outFile, () => {}); // Clean up wav file

        // If Whisper returned nothing or just whitespace, discard
        if (!text || !text.trim()) {
          console.log("Transcription empty, discarding.");
          return resolve(null);
        }

        console.log("Transcription:", text);

        // Format message so it looks like: "[SERVER] hello there"
        const finalMessage = `[${TTS_USERNAME}] ${text}`;

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

        resolve(text);
      } catch (err) {
        reject(err);
      }
    });

    ai.start();
  });
}

/**
 * Runs recording sessions sequentially so only one at a time
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

/**
 * Initialize STT if enabled
 */
export function initTTS() {
  if (!settings.stt_transcription) return;
  continuousLoop().catch(() => {});
}

initTTS();
