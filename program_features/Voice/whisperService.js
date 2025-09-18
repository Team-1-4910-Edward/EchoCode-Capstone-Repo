const fs = require("fs");
const mic = require("mic");
const path = require("path");
const os = require("os");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const OpenAI = require("openai");
const { spawn } = require("child_process");

ffmpeg.setFfmpegPath(ffmpegPath);

let micInstance;
let micInputStream;

function convertToMp3(inputFile, outputFile) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputFile)
      .audioChannels(1)
      .audioFrequency(16000)
      .toFormat("mp3")
      .on("end", () => resolve(outputFile))
      .on("error", reject)
      .save(outputFile);
  });
}

async function recordAndTranscribe(apiKey, outputChannel) {
  const client = new OpenAI({ apiKey });

  const tmpWav = path.join(os.tmpdir(), `echocode-${Date.now()}.wav`);

  return new Promise((resolve, reject) => {
    outputChannel?.appendLine("Recording 5s of audio with ffmpeg...");

    // Have to hardcode the devive name here. You can get a list of devices by running:
    // ffmpeg -list_devices true -f dshow -i dummy
    const ffmpegArgs = [
      "-y", // overwrite output
      "-f", "dshow",
      "-i", "audio=Microphone Array (2- Intel® Smart Sound Technology for Digital Microphones)",
      "-t", "5",       // record 5 seconds
      "-ac", "1",      // mono
      "-ar", "16000",  // 16kHz
      tmpWav
    ];

    const rec = spawn(ffmpegPath, ffmpegArgs);

    rec.stderr.on("data", d => outputChannel?.appendLine("[ffmpeg] " + d.toString()));

    rec.on("error", err => reject(err));

    rec.on("close", async code => {
      if (code !== 0) {
        reject(new Error("ffmpeg exited with code " + code));
        return;
      }

      try {
        outputChannel?.appendLine("Sending audio to Whisper API...");
        const resp = await client.audio.transcriptions.create({
          file: fs.createReadStream(tmpWav),
          model: "whisper-1",
        });

        const transcript = resp.text.trim();
        outputChannel?.appendLine(`[Whisper] Transcript: ${transcript}`);
        fs.unlink(tmpWav, () => {});
        resolve(transcript);
      } catch (err) {
        reject(err);
      }
    });
  });
}

module.exports = { recordAndTranscribe };
