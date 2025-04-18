
import { getKey, hasKey } from '../utils/keys.js';

const WebSocket = require('ws');
const fs = require('fs');
const { exec } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

/**
 * tts and play 
 * @param {string} text - text to speak 
 * @param {Object} options - options
 * @returns {Promise<string>} - path to save the audio 
 */
async function textToSpeech(text, options = {}) {
  return new Promise((resolve, reject) => {
    const defaultOptions = {
      appid: getKey("BYTEDANE_APP_ID"), 
      token: getKey("BYTEDANCE_APP_TOKEN"),
      cluster: 'volcano_tts', 
      voiceType: 'BV700_streaming', 
      rate: 24000,
      encoding: 'mp3', 
      speedRatio: 1.0, 
      volumeRatio: 1.0, 
      pitchRatio: 1.0, 
      emotion: 'neutral', 
      language: 'en', 
      operation: 'query', 
      outputDir: './voice_output', 
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
        uid: ""
      },
      audio: {
        voice_type: config.voiceType,
        encoding: config.encoding,
        rate: config.rate,
        speed_ratio: config.speedRatio,
        volume_ratio: config.volumeRatio,
        pitch_ratio: config.pitchRatio,
        emotion: config.emotion,
        language: config.language
      },
      request: {
        reqid: reqid,
        text: text,
        text_type: 'plain',
        operation: config.operation,
        silence_duration: 125,
        with_frontend: 1,
        frontend_type: 'unitTson',
        pure_english_opt: 1
      }
    };

    const ws = new WebSocket('wss://openspeech.bytedance.com/api/v1/tts/ws_binary', {
      headers: {
        'Authorization': `Bearer; ${config.token}`
      }
    });

    let audioBuffer = Buffer.alloc(0);
    const outputFilePath = path.join(config.outputDir, `tts_${reqid}.${config.encoding}`);

    ws.on('open', function open() {
      console.log('WebSocket opened. Send TTS request...');
      ws.send(JSON.stringify(requestData));
    });

    ws.on('message', function incoming(data) {
      try {
        const jsonResponse = JSON.parse(data);
        
        if (jsonResponse.code !== 3000) {
          reject(new Error(`TTS API错误: ${jsonResponse.message} (代码: ${jsonResponse.code})`));
          ws.close();
          return;
        }
        
        if (jsonResponse.data) {
          const chunk = Buffer.from(jsonResponse.data, 'base64');
          audioBuffer = Buffer.concat([audioBuffer, chunk]);
        }
        
        if (jsonResponse.sequence < 0) {
          console.log('TTS合成完成，保存文件');
          
          fs.writeFileSync(outputFilePath, audioBuffer);
          
          if (config.autoPlay) {
            playAudio(outputFilePath);
          }
          
          ws.close();
          resolve(outputFilePath);
        }
      } catch (e) {
        if (Buffer.isBuffer(data)) {
          audioBuffer = Buffer.concat([audioBuffer, data]);
        } else {
          console.warn('Received data of invalid format:', typeof data);
        }
      }
    });

    ws.on('error', function error(err) {
      console.error('WebSocket Erro:', err);
      reject(err);
    });

    ws.on('close', function close() {
      console.log('WebSocket closed.');
    });
  });
}

/**
 * play audio
 * @param {string} filePath - Path to audio file 
 */
function playAudio(filePath) {
  let command;
  
  switch (process.platform) {
    case 'darwin': // macOS
      command = `afplay "${filePath}"`;
      break;
    case 'win32': // Windows
      command = `start "${filePath}"`;
      break;
    default: // Linux 和其他
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
  exec(command, (error) => {
    if (error) {
      console.error('Error in plaing audio:', error);
    }
  });
}

/**
 * Check if command exists
 * @param {string} command - The command to check
 * @returns {boolean} - If the command exists
 */
function commandExists(command) {
  try {
    const result = require('child_process').spawnSync('which', [command], { stdio: 'ignore' });
    return result.status === 0;
  } catch (e) {
    return false;
  }
}

// Example of usage 
async function main() {
  try {
    const text = "Hello, welcome to use Mindcraft Generative Agents.";
    
    const filePath = await textToSpeech(text, {
      appid: 'YOUR_APP_ID', 
      token: 'YOUR_ACCESS_TOKEN', 
      voiceType: 'BV700_streaming', 
      emotion: 'happy', 
      speedRatio: 1.0, 
      autoPlay: true 
    });
    console.log(`Voice file saved to: ${filePath}`);
  } catch (error) {
    console.error('TTS Failed:', error);
  }
}

module.exports = { textToSpeech, playAudio };