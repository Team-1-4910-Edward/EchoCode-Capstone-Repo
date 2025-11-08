const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");

ffmpeg.setFfmpegPath(ffmpegPath);

let current = null; // { rec, tmpWav, stopResolver, stopped }

function makeTmpWav() {
  return path.join(os.tmpdir(), `echocode-${Date.now()}.wav`);
}

/**
 * Start recording mic audio. Returns true if started, false if already running.
 */
function startRecording(outputChannel) {
  if (!outputChannel || typeof outputChannel.appendLine !== "function") {
    outputChannel = { appendLine: console.log };
  }
  if (current) {
    outputChannel.appendLine("🎙️ Recording already in progress.");
    return false;
  }

  const tmpWav = makeTmpWav();

  // we are stopping by sending 'q' to ffmpeg stdin
  const ffmpegArgs = [
    "-y",
    "-f", "dshow",
    "-i", "audio=Microphone Array (2- Intel® Smart Sound Technology for Digital Microphones)", // <- your device
    "-ac", "1",
    "-ar", "16000",
    "-filter:a", "volume=12dB",
    tmpWav
  ];

  const rec = spawn(ffmpegPath, ffmpegArgs, { stdio: ["pipe", "pipe", "pipe"] });

  rec.stderr.on("data", d => outputChannel.appendLine("[ffmpeg] " + d.toString()));
  rec.on("error", err => outputChannel.appendLine("[ffmpeg error] " + err.message));

  // Prepare controller
  current = {
    rec,
    tmpWav,
    stopped: false,
    stopResolver: null,
    stopPromise: new Promise(res => { current && (current.stopResolver = res); }),
  };

  outputChannel.appendLine("🎙️ Recording started… Click again to stop.");
  return true;
}

/**
 * Stop recording and run local Whisper → returns transcript string.
 */
function stopAndTranscribe(outputChannel) {
  if (!outputChannel || typeof outputChannel.appendLine !== "function") {
    outputChannel = { appendLine: console.log };
  }

  return new Promise((resolve, reject) => {
    if (!current) return reject(new Error("No recording in progress."));
    if (current.stopped) return reject(new Error("Recording already stopping."));

    const { rec, tmpWav } = current;
    current.stopped = true;

    outputChannel.appendLine("Stopping recording…");

    // Graceful stop
    try { rec.stdin.write("q"); } catch (_) {}
    try { rec.stdin.end(); } catch (_) {}

    // Much shorter flush time (faster reaction)
    const killTimer = setTimeout(() => {
      try { rec.kill("SIGKILL"); } catch (_) {}
    }, 500);

    rec.on("close", (code, signal) => {
      clearTimeout(killTimer);
      outputChannel.appendLine(`ffmpeg closed. code=${code}, signal=${signal}`);

      // Check if file exists and has audio-like size (0.7s ~ 70/80 KB)
      fs.stat(tmpWav, (err, stats) => {
        const hasAudio = !err && stats && stats.size > 20 * 1024;

        if (!hasAudio) {
          // One more short grace period: sometimes write finishes right after close
          setTimeout(() => {
            fs.stat(tmpWav, (err2, st2) => {
              const hasAudio2 = !err2 && st2 && st2.size > 100 * 1024;
              if (!hasAudio2) {
                current = null;
                const detail = err2 ? err2.message : `size=${st2?.size ?? 0}`;
                return reject(new Error(`ffmpeg exited before audio was ready (${detail}).`));
              }
              // Proceed if file is now present
              runLocalWhisper(tmpWav, outputChannel).then(
                (text) => { current = null; resolve(text); },
                (e) =>   { current = null; reject(e); }
              );
            });
          }, 30);
          return;
        }

        // Proceed: WAV is ready
        runLocalWhisper(tmpWav, outputChannel).then(
          (text) => { current = null; resolve(text); },
          (e) =>   { current = null; reject(e); }
        );
      });
    });
  });
}

function runLocalWhisper(tmpWav, outputChannel) {
  return new Promise((resolve, reject) => {
    outputChannel.appendLine("Recording complete. Running local Whisper model...");
    const pythonScript = path.join(__dirname, "local_whisper_stt.py");
    const py = spawn("python", [pythonScript, tmpWav], { stdio: ["ignore", "pipe", "pipe"] });

    let transcript = "";
    let stderrOutput = "";

    py.stdout.on("data", (data) => { transcript += data.toString(); });
    py.stderr.on("data", (data) => {
      stderrOutput += data.toString();
      outputChannel.appendLine("[Whisper Local STDERR] " + data.toString());
    });

    py.on("close", (code2) => {
      fs.unlink(tmpWav, () => {});
      if (code2 !== 0) {
        if (stderrOutput) outputChannel.appendLine(`[Python Error Traceback]:\n${stderrOutput}`);
        return reject(new Error(`Local Whisper script exited with code ${code2}`));
      }
      const clean = transcript.trim();
      outputChannel.appendLine(`[Local Whisper] Transcript: ${clean}`);
      resolve(clean);
    });
  });
}

/**
 * Convenience: toggle recording. If not recording → start.
 * If recording → stop & transcribe.
 */
async function toggleRecordTranscribe(outputChannel) {
  if (!current) {
    startRecording(outputChannel);
    return null; // nothing to return yet
  } else {
    const text = await stopAndTranscribe(outputChannel);
    return text;
  }
}

module.exports = {
  startRecording,
  stopAndTranscribe,
  toggleRecordTranscribe,
};
