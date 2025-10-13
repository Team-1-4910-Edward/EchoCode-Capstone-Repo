const fs = require("fs");
const path = require("path");
const os = require("os");
const OpenAI = require("openai");
const ffmpegPath = require("ffmpeg-static");
const { spawn } = require("child_process");

function makeTempWav() {
  return path.join(os.tmpdir(), `echocode-${Date.now()}.wav`);
}

function buildInputArgs(deviceName) {
  const plat = process.platform;
  if (plat === "win32") {
    return ["-f", "dshow", "-i", deviceName ? `audio=${deviceName}` : "audio=default"];
  } else if (plat === "darwin") {
    return ["-f", "avfoundation", "-i", deviceName || ":0"];
  } else {
    return ["-f", "alsa", "-i", deviceName || "default"];
  }
}

function startMicCapture({ deviceName, outputChannel } = {}) {
  if (!ffmpegPath) throw new Error("ffmpeg-static not found. Run: npm i ffmpeg-static");

  const tmpWav = makeTempWav();
  const inputArgs = buildInputArgs(deviceName);
  const args = ["-y", ...inputArgs, "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", tmpWav];

  outputChannel?.appendLine(`[Whisper] ffmpeg path: ${ffmpegPath}`);
  outputChannel?.appendLine(`[Whisper] ffmpeg args: ${JSON.stringify(args)}`);

  const ff = spawn(ffmpegPath, args, { stdio: ["pipe", "pipe", "pipe"] });

  let stderrBuf = "";
  ff.stderr.on("data", (d) => {
    const s = d.toString();
    stderrBuf += s;
    outputChannel?.appendLine(`[ffmpeg] ${s.trim()}`);
  });

  let closed = false;
  ff.on("close", (code) => {
    closed = true;
    outputChannel?.appendLine(`[Whisper] ffmpeg exited with code ${code}`);
  });

  ff.on("error", (err) => {
    outputChannel?.appendLine(`[Whisper] spawn error: ${err.message}`);
  });

  return {
    tmpWav,
    async stop(client) {
      return new Promise((resolve, reject) => {
        try { ff.stdin.write("q"); ff.stdin.end(); } catch (_) {}
        const wait = () => {
          if (!closed) return setTimeout(wait, 120);
          (async () => {
            try {
              if (!fs.existsSync(tmpWav)) {
                return reject(new Error(`ffmpeg did not produce output file.\n${stderrBuf}`));
              }
              const resp = await client.audio.transcriptions.create({
                file: fs.createReadStream(tmpWav),
                model: "whisper-1",
              });
              const text = (resp?.text || "").trim();
              try { fs.unlinkSync(tmpWav); } catch (_) {}
              resolve(text);
            } catch (e) {
              reject(e);
            }
          })();
        };
        wait();
      });
    },
  };
}

function getOpenAIClient(apiKey) {
  if (!apiKey) throw new Error("No API key provided to whisperService.");
  return new OpenAI({ apiKey });
}

/**
 * Compatibility function for existing code that calls recordAndTranscribe().
 */
async function recordAndTranscribe(apiKey, outputChannel, opts = {}) {
  const client = getOpenAIClient(apiKey);
  const controller = startMicCapture({
    deviceName: opts.deviceName,
    outputChannel,
  });
  const ms = Number(opts.durationMs ?? 5000);
  await new Promise((r) => setTimeout(r, ms));
  const text = await controller.stop(client);
  return text;
}

module.exports = {
  startMicCapture,
  getOpenAIClient,
  recordAndTranscribe,
};
