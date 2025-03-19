import { exec } from 'child_process';

let speakingQueue = [];
let isSpeaking = false;

export function say(textToSpeak) {
  speakingQueue.push(textToSpeak);
  if (!isSpeaking) {
    processQueue();
  }
}

function processQueue() {
  if (speakingQueue.length === 0) {
    isSpeaking = false;
    return;
  }

  isSpeaking = true;
  const textToSpeak = speakingQueue.shift();
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
    processQueue(); // Continue with the next message in the queue
  });
}
