import { exec } from 'child_process';

export function say(textToSpeak) {
  const isWin = process.platform === "win32";
  const isMac = process.platform === "darwin";

  let command;

  if (isWin) {
    command = `powershell -Command "Add-Type –AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak(\\"${textToSpeak}\\")"`;
  } else if (isMac) {
    command = `say "${textToSpeak}"`;
  } else {
    command = `espeak "${textToSpeak}"`;
  }

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`Error: ${stderr}`);
      return;
    }
  });
}
