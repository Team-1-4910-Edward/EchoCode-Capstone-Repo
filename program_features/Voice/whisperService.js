const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn, exec } = require("child_process");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const vscode = require("vscode");

ffmpeg.setFfmpegPath(ffmpegPath);

let current = null;

function makeTmpWav() {
  return path.join(os.tmpdir(), `echocode-${Date.now()}.wav`);
}

/**
 * Helper: List available audio devices using ffmpeg
 */
function listAudioDevices(outputChannel) {
  return new Promise((resolve) => {
    const cmd = `"${ffmpegPath}" -list_devices true -f dshow -i dummy`;

    if (outputChannel)
      outputChannel.appendLine(`[Voice] detecting devices: ${cmd}`);

    exec(cmd, (err, stdout, stderr) => {
      const rawOutput = stderr.toString();
      const deviceMatches = [];
      let isAudioSection = false;

      const lines = rawOutput.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.includes("DirectShow audio devices")) {
          isAudioSection = true;
          continue;
        }
        if (line.includes("DirectShow video devices")) {
          isAudioSection = false;
          continue;
        }

        if (isAudioSection) {
          if (line.includes("Alternative name")) continue;
          const quoteMatch = line.match(/"([^"]+)"/);
          if (quoteMatch) {
            const deviceName = quoteMatch[1];
            if (!deviceMatches.includes(deviceName)) {
              deviceMatches.push(deviceName);
            }
          }
        }
      }
      resolve(deviceMatches);
    });
  });
}

/**
 * Configurable microphone selection
 */
async function getMicrophoneName(context, outputChannel) {
  let savedMic = context.globalState.get("echoCodeMicrophone");
  if (!savedMic) {
    const devices = await listAudioDevices(outputChannel);
    if (devices.length > 0) {
      savedMic = devices[0];
      await context.globalState.update("echoCodeMicrophone", savedMic);
      if (outputChannel)
        outputChannel.appendLine(`[Voice] Auto-selected mic: "${savedMic}"`);
    } else {
      savedMic = "default";
      if (outputChannel)
        outputChannel.appendLine("[Voice] Using system default mic.");
    }
  }
  return savedMic;
}

/**
 * Command to allow user to change microphone
 */
async function selectMicrophone(context) {
  const devices = await listAudioDevices(null);
  const items = [...devices, "Enter Device Name Manually..."];

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: "Select a microphone for Voice Commands",
  });

  if (selected === "Enter Device Name Manually...") {
    const manualName = await vscode.window.showInputBox({
      placeHolder: "Microphone (Realtek Audio)",
      prompt: "Enter the exact device name as seen in Windows Sound Settings",
    });
    if (manualName) {
      await context.globalState.update("echoCodeMicrophone", manualName);
      vscode.window.showInformationMessage(`Microphone set to: ${manualName}`);
    }
  } else if (selected) {
    await context.globalState.update("echoCodeMicrophone", selected);
    vscode.window.showInformationMessage(`Microphone set to: ${selected}`);
  }
}

/**
 * Start recording mic audio.
 */
async function startRecording(outputChannel, context) {
  if (current && !current.stopped) {
    outputChannel.appendLine("⚠️ Recording already in progress.");
    return false;
  }

  const tmpWav = makeTmpWav();
  const micName = await getMicrophoneName(context, outputChannel);

  let ffmpegArgs = [];
  if (micName === "default") {
    outputChannel.appendLine(`[Voice] Attempting default audio input...`);
    ffmpegArgs = [
      "-f",
      "dshow",
      "-i",
      "audio=Microphone (Realtek(R) Audio)",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-y",
      tmpWav,
    ];
  } else {
    outputChannel.appendLine(`[Voice] Using Microphone: "${micName}"`);
    ffmpegArgs = [
      "-f",
      "dshow",
      "-i",
      `audio=${micName}`,
      "-ac",
      "1",
      "-ar",
      "16000",
      "-y",
      tmpWav,
    ];
  }

  outputChannel.appendLine(
    `[ffmpeg] Spawning with args: ${ffmpegArgs.join(" ")}`
  );

  // CRITICAL FIX: Stdio must be 'pipe' for stdin to work (so we can send 'q')
  const rec = spawn(ffmpegPath, ffmpegArgs, {
    stdio: ["pipe", "pipe", "pipe"],
  });

  rec.stderr.on("data", (d) => {
    const msg = d.toString();
    // Log errors/warnings
    if (
      msg.toLowerCase().includes("error") ||
      msg.toLowerCase().includes("failed")
    ) {
      outputChannel.appendLine("[ffmpeg error] " + msg);
    }
  });

  // Create a promise logic that waits for physical process exit
  let stopResolver;
  const stopPromise = new Promise((resolve) => {
    stopResolver = resolve;
  });

  rec.on("close", (code) => {
    outputChannel.appendLine(`[ffmpeg] Process exited with code ${code}`);
    stopResolver(code);
  });

  rec.on("error", (err) => {
    outputChannel.appendLine("[ffmpeg fatal] " + err.message);
    stopResolver(-1);
  });

  current = {
    rec,
    tmpWav,
    stopped: false,
    stopPromise, // Exposed so stopAndTranscribe can wait for THIS specific promise
  };

  outputChannel.appendLine("🎙️ Recording started… Click again to stop.");
  return true;
}

/**
 * Stop recording and run local Whisper
 */
function stopAndTranscribe(outputChannel, globalState) {
  if (!outputChannel || typeof outputChannel.appendLine !== "function") {
    outputChannel = { appendLine: console.log };
  }

  return new Promise(async (resolve, reject) => {
    if (!current) return reject(new Error("No recording in progress."));

    current.stopped = true;
    const { rec, tmpWav, stopPromise } = current;

    outputChannel.appendLine("[Voice] Stopping recording...");

    // 1. Try polite stop first (send 'q' to stdin)
    // This allows ffmpeg to flush headers and close cleanly
    try {
      if (rec.stdin && !rec.stdin.destroyed) {
        rec.stdin.write("q");
        rec.stdin.end(); // close stdin
      }
    } catch (e) {
      outputChannel.appendLine("[Voice] Note: Could not send 'q' to ffmpeg.");
    }

    // 2. Fallback: Force kill if it hasn't exited after 1 second
    const killTimeout = setTimeout(() => {
      if (current && current.rec) {
        outputChannel.appendLine("[Voice] Force killing ffmpeg...");
        try {
          process.kill(rec.pid, "SIGINT"); // Try SIGINT first (Ctrl+C)
          setTimeout(() => rec.kill(), 200); // Then force kill
        } catch (e) {}
      }
    }, 1500);

    // 3. Wait for the process to actually exit
    await stopPromise;
    clearTimeout(killTimeout);

    current = null;

    // 4. Validate output
    if (!fs.existsSync(tmpWav)) {
      return reject(new Error("Recording failed: WAV file not created."));
    }

    // Wait a slight delay to ensure filesystem lock is released
    await new Promise((r) => setTimeout(r, 200));

    const stats = await fs.promises.stat(tmpWav);
    outputChannel.appendLine(`[Voice] Wav file size: ${stats.size} bytes`);

    if (stats.size < 1000) {
      return reject(new Error("Recording too short/empty."));
    }

    const pythonPath = globalState
      ? globalState.get("echoCodePythonPath")
      : "python";

    runLocalWhisper(tmpWav, outputChannel, pythonPath).then(resolve, reject);
  });
}

function runLocalWhisper(tmpWav, outputChannel, pythonCommand) {
  return new Promise((resolve, reject) => {
    outputChannel.appendLine(
      `Running Whisper using interpreter: '${pythonCommand}'...`
    );
    const pythonScript = path.join(__dirname, "local_whisper_stt.py");

    const py = spawn(pythonCommand, [pythonScript, tmpWav], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let transcript = "";

    py.stdout.on("data", (data) => {
      transcript += data.toString();
    });

    py.stderr.on("data", (data) => {
      outputChannel.appendLine(`[Whisper Log] ${data.toString()}`);
    });

    py.on("close", (code) => {
      fs.unlink(tmpWav, () => {}); // Cleanup

      if (code !== 0) {
        return reject(new Error(`Whisper process exited with code ${code}`));
      }
      const clean = transcript.trim();
      resolve(clean);
    });

    py.on("error", (err) => {
      reject(new Error(`Failed to start Python process: ${err.message}`));
    });
  });
}

module.exports = { startRecording, stopAndTranscribe, selectMicrophone };
