import { exec, spawn } from 'child_process';
import settings from '../../settings.js';
import { sendAudioRequest } from '../models/pollinations.js';

let speakingQueue = [];
let isSpeaking = false;

export function say(text) {
  speakingQueue.push(text);
  if (!isSpeaking) processQueue();
}

async function processQueue() {
  if (speakingQueue.length === 0) {
    isSpeaking = false;
    return;
  }
  isSpeaking = true;
  const txt = speakingQueue.shift();

  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  const model = settings.speak_model || 'pollinations/openai-audio/echo';

  if (model === 'system') {
    // system TTS
    const cmd = isWin
      ? `powershell -NoProfile -Command "Add-Type -AssemblyName System.Speech; \
$s=New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Rate=2; \
$s.Speak('${txt.replace(/'/g,"''")}'); $s.Dispose()"`
      : isMac
      ? `say "${txt.replace(/"/g,'\\"')}"`
      : `espeak "${txt.replace(/"/g,'\\"')}"`;

    exec(cmd, err => {
      if (err) console.error('TTS error', err);
      processQueue();
    });

  } else {
    // remote audio provider
    const [prov, mdl, voice] = model.split('/');
    if (prov !== 'pollinations') throw new Error(`Unknown provider: ${prov}`);

    try {
      let audioData = await sendAudioRequest(txt, mdl, voice);
      if (!audioData) {
        audioData = "SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU5LjI3LjEwMAAAAAAAAAAAAAAA/+NAwAAAAAAAAAAAAEluZm8AAAAPAAAAAAAAANAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAExhdmM1OS4zNwAAAAAAAAAAAAAAAAAAAAAAAAAAAADQAAAeowAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";
        // ^ 0 second silent audio clip
      }

      if (isWin) {
        const ps = `
          Add-Type -AssemblyName presentationCore;
          $p=New-Object System.Windows.Media.MediaPlayer;
          $p.Open([Uri]::new("data:audio/mp3;base64,${audioData}"));
          $p.Play();
          Start-Sleep -Seconds [math]::Ceiling($p.NaturalDuration.TimeSpan.TotalSeconds);
        `;
        spawn('powershell', ['-NoProfile','-Command', ps], {
          stdio: 'ignore', detached: true
        }).unref();
        processQueue();

      } else {
        const player = spawn('ffplay', ['-nodisp','-autoexit','pipe:0'], {
          stdio: ['pipe','ignore','ignore']
        });
        player.stdin.write(Buffer.from(audioData, 'base64'));
        player.stdin.end();
        player.on('exit', processQueue);
      }

    } catch (e) {
      console.error('Audio error', e);
      processQueue();
    }
  }
}
