import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { TTSConfig as gptTTSConfig } from '../models/gpt.js';
import { TTSConfig as geminiTTSConfig } from '../models/gemini.js';

let speakingQueue = []; // each item: {text, model, audioData, ready}
let isSpeaking = false;

export function speak(text, speak_model) {
    const model = speak_model || 'system';

    const item = { text, model, audioData: null, ready: null };

    if (model === 'system') {
        // no preprocessing needed
        item.ready = Promise.resolve();
    } else {
        item.ready = fetchRemoteAudio(text, model)
            .then(data => { item.audioData = data; })
            .catch(err => { item.error = err; });
    }

    speakingQueue.push(item);
    if (!isSpeaking) processQueue();
}

async function fetchRemoteAudio(txt, model) {
    function getModelUrl(prov) {
        if (prov === 'openai') return gptTTSConfig.baseUrl;
        if (prov === 'google') return geminiTTSConfig.baseUrl;
        return 'https://api.openai.com/v1';
    }

    let prov, mdl, voice, url;
    if (typeof model === 'string') {
        [prov, mdl, voice] = model.split('/');
        url = getModelUrl(prov);
    } else {
        prov = model.api;
        mdl = model.model;
        voice = model.voice;
        url = model.url || getModelUrl(prov);
    }

    if (prov === 'openai') {
        return gptTTSConfig.sendAudioRequest(txt, mdl, voice, url);
    } else if (prov === 'google') {
        return geminiTTSConfig.sendAudioRequest(txt, mdl, voice, url);
    }
    else {
        throw new Error(`TTS Provider ${prov} is not supported.`);
    }
}

function finishQueueItem() {
    isSpeaking = false;
    processQueue();
}

function spawnSystemTts(txt) {
    const isWin = process.platform === 'win32';
    const isMac = process.platform === 'darwin';

    if (isWin) {
        const script = [
            'Add-Type -AssemblyName System.Speech',
            '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
            '$s.Rate = 2',
            '$s.Speak($env:MINDCRAFT_TTS_TEXT)',
            '$s.Dispose()'
        ].join('; ');
        return spawn('powershell', ['-NoProfile', '-Command', script], {
            stdio: 'ignore',
            windowsHide: true,
            env: { ...process.env, MINDCRAFT_TTS_TEXT: txt }
        });
    }

    if (isMac) {
        return spawn('say', [txt], { stdio: 'ignore' });
    }

    return spawn('espeak', [txt], { stdio: 'ignore' });
}

async function processQueue() {
    isSpeaking = true;
    if (speakingQueue.length === 0) {
        isSpeaking = false;
        return;
    }
    const item = speakingQueue.shift();
    const { text: txt, model } = item;
    if (txt.trim() === '') {
        finishQueueItem();
        return;
    }

    const isWin = process.platform === 'win32';

    // wait for preprocessing if needed
    try {
        await item.ready;
        if (item.error) throw item.error;
    } catch (err) {
        console.error('[TTS] preprocess error', err);
        finishQueueItem();
        return;
    }

    if (model === 'system') {
        // Pass speech text outside the shell command so model-controlled text
        // is never parsed as shell or PowerShell syntax.
        const player = spawnSystemTts(txt);
        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            finishQueueItem();
        };
        player.on('error', (err) => {
            console.error('TTS error', err);
            finish();
        });
        player.on('exit', finish);
        return;
    }

    // audioData was already fetched in speak()
    const audioData = item.audioData;

    if (!audioData) {
        console.error('[TTS] No audio data ready');
        finishQueueItem();
        return;
    }

    try {
        if (isWin) {
            const tmpPath = path.join(os.tmpdir(), `tts_${Date.now()}.mp3`);
            await fs.writeFile(tmpPath, Buffer.from(audioData, 'base64'));

            const player = spawn('ffplay', ['-nodisp', '-autoexit', '-loglevel', 'quiet', tmpPath], {
                stdio: 'ignore', windowsHide: true
            });
            let finished = false;
            const finish = async () => {
                if (finished) return;
                finished = true;
                try { await fs.unlink(tmpPath); } catch {}
                finishQueueItem();
            };
            player.on('error', async (err) => {
                console.error('[TTS] ffplay error', err);
                await finish();
            });
            player.on('exit', finish);

        } else {
            const player = spawn('ffplay', ['-nodisp','-autoexit','pipe:0'], {
                stdio: ['pipe','ignore','ignore']
            });
            player.stdin.write(Buffer.from(audioData, 'base64'));
            player.stdin.end();
            let finished = false;
            const finish = () => {
                if (finished) return;
                finished = true;
                finishQueueItem();
            };
            player.on('error', (err) => {
                console.error('[TTS] ffplay error', err);
                finish();
            });
            player.on('exit', finish);
        }
    } catch (e) {
        console.error('[TTS] Audio error', e);
        finishQueueItem();
    }
}
