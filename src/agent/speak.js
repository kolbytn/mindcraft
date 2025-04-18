import { exec } from 'child_process';
import { textToSpeech } from './tts.js';

let speakingQueue = [];
let isSpeaking = false;

export function say(textToSpeak, voiceType = null) {
  speakingQueue.push(textToSpeak);
  if (!isSpeaking) {
    processQueue(voiceType = voiceType);
  }
}

function processQueue(voiceType = null) {
  if (speakingQueue.length === 0) {
    isSpeaking = false;
    return;
  }

  isSpeaking = true;
  const textToSpeak = speakingQueue.shift();
  if (voiceType) {
    callSpeakAPI(textToSpeak, voiceType)
      .then(() => {
        processQueue(voiceType);
      }).catch(() => {});
  } else {
    const isWin = process.platform === "win32";
    const isMac = process.platform === "darwin";

    let command;

    if (isWin) {
      command = `powershell -Command "Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Rate = 2; $s.Speak(\\"${textToSpeak}\\"); $s.Dispose()"`;
    } else if (isMac) {
      command = `say "${textToSpeak}"`;
    } else {
      command = `espeak "${textToSpeak}"`;
    }

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error: ${error.message}`);
        console.error(`${error.stack}`);
      } else if (stderr) {
        console.error(`Error: ${stderr}`);
      }
      processQueue(voiceType); // Continue with the next message in the queue
    });
  }
}

async function callSpeakAPI(text, voiceType) {
    if (voiceType) {
        console.log("TTS for openChat().")
        try {
            const filePath = await textToSpeech(text, {
                voiceType: voiceType, 
            });
            console.log(`Voice file saved to: ${filePath}`);
        } catch (error) {
            console.error('TTS Failed:', error.message, error.response.data);
        }
    }
}