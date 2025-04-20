import axios from 'axios';
import fs from 'fs';
import { exec } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { getKey } from '../utils/keys.js';

/**
 * tts and play using HTTP one-time synthesis
 * @param {string} text - text to speak 
 * @param {Object} options - options
 * @returns {Promise<string>} - path to save the audio 
 */
export async function textToSpeech(text, options = {}) {
  const defaultOptions = {
    appid: getKey("BYTEDANCE_APP_ID"), 
    token: getKey("BYTEDANCE_APP_TOKEN"),
    cluster: 'volcano_tts', 
    voiceType: 'BV001_streaming', 
    operation: "query",
    rate: 24000,
    encoding: 'mp3', 
    speedRatio: 1.0, 
    volumeRatio: 1.0, 
    pitchRatio: 1.0, 
    outputDir: './tts_output', 
    autoPlay: true
  };

  const config = { ...defaultOptions, ...options };
  
  if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir, { recursive: true });
  }

  const reqid = uuidv4();
  
  const requestData = {
    app: {
      appid: config.appid,
      token: config.token,
      cluster: config.cluster
    },
    user: {
      uid: "11111111111"
    },
    audio: {
      voice_type: config.voiceType,
      rate: config.rate,
      encoding: config.encoding,
    },
    request: {
      reqid : reqid,
      text : text,
      operation : config.operation, 
    }
  };

  const response = await axios.post('https://openspeech.bytedance.com/api/v1/tts', requestData, {
    headers: {
      'Authorization': `Bearer;${config.token}`,
      'Content-Type': 'application/json'
    }
  });

  if (response.status !== 200 || response.data.code !== 3000) {
    throw new Error(`TTS API Error: ${response.data.message || 'Unknown error'} (code: ${response.data.code || response.status})`);
  }

  // Base64 decode the audio data
  const audioData = Buffer.from(response.data.data, 'base64');
  const outputFilePath = path.join(config.outputDir, `tts_${reqid}.${config.encoding}`);
  
  // Write to file
  fs.writeFileSync(outputFilePath, audioData);
  
  if (config.autoPlay) {
    playAudio(outputFilePath);
  }
  
  return outputFilePath;
};

/**
 * play audio
 * @param {string} filePath - Path to audio file 
 */
export const playAudio = filePath => {
  let command;
  
  switch (process.platform) {
    case 'darwin': // macOS
      command = `afplay "${filePath}"`;
      break;
    case 'win32': // Windows
      command = `start "${filePath}"`;
      break;
    default: // Linux and others
      if (commandExists('mplayer')) {
        command = `mplayer "${filePath}"`;
      } else if (commandExists('mpg123')) {
        command = `mpg123 "${filePath}"`;
      } else if (commandExists('aplay')) {
        command = `aplay "${filePath}"`;
      } else {
        console.warn('Cannot find available player.');
        return;
      }
  }

  console.log(`Play audio: ${filePath}`);
  exec(command, error => {
    if (error) {
      console.error('Error in playing audio:', error);
    }
  });
};

/**
 * Check if command exists
 * @param {string} command - The command to check
 * @returns {boolean} - If the command exists
 */
const commandExists = command => {
  try {
    const { spawnSync } = require('child_process');
    const result = spawnSync('which', [command], { stdio: 'ignore' });
    return result.status === 0;
  } catch (e) {
    return false;
  }
};

// Example of usage 
const ttsExample = async () => {
  try {
    const text = "Hello, welcome to use Mindcraft Generative Agents.";
    
    const filePath = await textToSpeech(text, {
      appid: 'YOUR_APP_ID', 
      token: 'YOUR_ACCESS_TOKEN', 
      voiceType: 'BV700_streaming', 
      speedRatio: 1.0, 
      autoPlay: true 
    });
    console.log(`Voice file saved to: ${filePath}`);
  } catch (error) {
    console.error('TTS Failed:', error);
  }
};