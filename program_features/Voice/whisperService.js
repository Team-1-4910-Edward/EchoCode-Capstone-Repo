const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");

ffmpeg.setFfmpegPath(ffmpegPath);

/**
 * Records 5 seconds of microphone audio using ffmpeg and transcribes it
 * with the local faster-whisper model (offline).
 *
 * @param {vscode.OutputChannel} outputChannel - VS Code output channel for logs.
 * @returns {Promise<string>} Transcript of the audio.
 */
async function recordAndTranscribe(outputChannel) {
  if (!outputChannel || typeof outputChannel.appendLine !== "function") {
    // fallback to console logging if no VS Code channel
    outputChannel = { appendLine: console.log };
  }

  const tmpWav = path.join(os.tmpdir(), `echocode-${Date.now()}.wav`);
  const pythonScript = path.join(__dirname, "local_whisper_stt.py");

  return new Promise((resolve, reject) => {
    outputChannel.appendLine("🎙️ Recording 5 seconds of audio...");

    // const ffmpegArgs = [
    //   "-y",
    //   "-f", "dshow",
    //   "-i", "audio=Microphone Array (2- Intel® Smart Sound Technology for Digital Microphones)", // change device name if needed
    //   "-t", "5",
    //   "-ac", "1",
    //   "-ar", "16000",
    //   tmpWav
    // ];

    const ffmpegArgs = [
      "-y",
      "-f", "dshow",
      "-i", "audio=Microphone Array (2- Intel® Smart Sound Technology for Digital Microphones)",
      "-t", "5",
      "-ac", "1",
      "-ar", "16000",
      "-filter:a", "volume=15dB",  // 🔊 amplify by 15 decibels
      tmpWav
    ];

    // const micName = "Microphone Array (2- Intel® Smart Sound Technology for Digital Microphones)";
    // const ffmpegArgs = [
    //   "-y", "-f", "dshow",
    //   "-i", `audio=${micName}`,
    //   "-t", "5", "-ac", "1", "-ar", "16000",
    //   "-af", "loudnorm,volume=200dB",
    //   tmpWav
    // ];

    const rec = spawn(ffmpegPath, ffmpegArgs);
    rec.stderr.on("data", d => outputChannel.appendLine("[ffmpeg] " + d.toString()));
    rec.on("error", err => reject(err));

    rec.on("close", async code => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}`));
        return;
      }

      outputChannel.appendLine("✅ Recording complete. Running local Whisper model...");

      const py = spawn("python", [pythonScript, tmpWav]);
      let transcript = "";

      py.stdout.on("data", (data) => {
        transcript += data.toString();
      });

      let stderrOutput = "";

      py.stdout.on("data", (data) => {
        transcript += data.toString();
      });

      py.stderr.on("data", (data) => {
        stderrOutput += data.toString();
        outputChannel.appendLine("[Whisper Local STDERR] " + data.toString());
      });

      py.on("close", (code) => {
        fs.unlink(tmpWav, () => {});
        if (code !== 0) {
          outputChannel.appendLine(`[Whisper Local Error] Python exited with code ${code}`);
          if (stderrOutput) outputChannel.appendLine(`[Python Error Traceback]:\n${stderrOutput}`);
          reject(new Error(`Local Whisper script exited with code ${code}`));
        } else {
          const clean = transcript.trim();
          outputChannel.appendLine(`[Local Whisper] Transcript: ${clean}`);
          resolve(clean);
        }
      });
    });
  });
}

module.exports = { recordAndTranscribe };
