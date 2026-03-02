import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { TTSConfig as gptTTSConfig } from '../models/gpt.js';
import { TTSConfig as geminiTTSConfig } from '../models/gemini.js';

let speakingQueue = []; // each item: {text, model, audioData, ready}
let isSpeaking = false;

export async function speak(text, speak_model) {
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
    if (!isSpeaking) await processQueue();
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

async function processQueue() {
    isSpeaking = true;
    if (speakingQueue.length === 0) {
        isSpeaking = false;
        return;
    }
    const item = speakingQueue.shift();
    const { text: txt, model, audioData: _audioData } = item;
    if (txt.trim() === '') {
        isSpeaking = false;
        await processQueue();
        return;
    }

    const isWin = process.platform === 'win32';
    const isMac = process.platform === 'darwin';

    // wait for preprocessing if needed
    try {
        await item.ready;
        if (item.error) throw item.error;
    } catch (err) {
        console.error('[TTS] preprocess error', err);
        isSpeaking = false;
        await processQueue();
        return;
    }

    if (model === 'system') {
        // system TTS — use spawn with argument arrays to prevent command injection
        let proc;
        if (isWin) {
            // Pass text via stdin so it never touches the shell command line
            const psScript = `Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.Rate = 2
$txt = [System.Console]::In.ReadToEnd()
$s.Speak($txt)
$s.Dispose()`;
            proc = spawn('powershell', ['-NoProfile', '-Command', psScript],
                { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true });
            proc.stdin.write(txt, 'utf8');
            proc.stdin.end();
        } else if (isMac) {
            // Guard against text starting with '-' which 'say' would treat as a flag.
            const safeTxt = txt.startsWith('-') ? ` ${txt}` : txt;
            proc = spawn('say', [safeTxt], { stdio: 'ignore' });
        } else {
            // '--' signals end of options so leading '-' in LLM text is not a flag.
            proc = spawn('espeak', ['--', txt], { stdio: 'ignore' });
        }
        proc.on('error', err => console.error('TTS error', err));
        proc.on('exit', async () => { isSpeaking = false; await processQueue(); });

    } 
    else {
        // audioData was already fetched in speak()
        const audioData = item.audioData;

        if (!audioData) {
            console.error('[TTS] No audio data ready');
            isSpeaking = false;
            await processQueue();
            return;
        }

        try {
            if (isWin) {
                const tmpPath = path.join(os.tmpdir(), `tts_${Date.now()}.mp3`);
                await fs.writeFile(tmpPath, Buffer.from(audioData, 'base64'));

                const player = spawn('ffplay', ['-nodisp', '-autoexit', '-loglevel', 'quiet', tmpPath], {
                    stdio: 'ignore', windowsHide: true
                });
                player.on('error', async (err) => {
                    console.error('[TTS] ffplay error', err);
                    try { await fs.unlink(tmpPath); } catch {}
                    isSpeaking = false;
                    await processQueue();
                });
                player.on('exit', async () => {
                    try { await fs.unlink(tmpPath); } catch {}
                    isSpeaking = false;
                    await processQueue();
                });

            } else {
                const player = spawn('ffplay', ['-nodisp','-autoexit','pipe:0'], {
                    stdio: ['pipe','ignore','ignore']
                });
                player.stdin.write(Buffer.from(audioData, 'base64'));
                player.stdin.end();
                player.on('exit', async () => {
                    isSpeaking = false;
                    await processQueue();
                });
            }
        } catch (e) {
            console.error('[TTS] Audio error', e);
            isSpeaking = false;
            await processQueue();
        }
    }
}
