const vscode = require("vscode");
const path = require("path");
const { spawn } = require("child_process");
const ffmpegBin = require("ffmpeg-static");
const fs = require("fs");
const os = require("os");
const sound = require("sound-play");
const say = require("say");

require("dotenv").config({ path: path.join(__dirname, ".env") });

console.log("EchoCode: Loaded API_KEY?", !!process.env.API_KEY);

const {
  startMicCapture,
  getOpenAIClient,
  recordAndTranscribe, // legacy one-shot flow still supported
} = require("./program_features/Voice/whisperService");

// ===== LLM voice intent routing =====
const { classifyVoiceIntent } = require("./program_settings/program_settings/AIrequest");

/** Catalog of voice-routable commands */
const VOICE_COMMANDS = [
  { id: "echocode.annotate",                title: "Toggle EchoCode Annotations",     description: "Generate or toggle inline annotations for this file." },
  { id: "echocode.readAllAnnotations",      title: "Read All Annotations",            description: "Speak all annotations currently in the queue." },
  { id: "echocode.summarizeFunction",       title: "Summarize Function",              description: "Explain what the current function does." },
  { id: "echocode.summarizeClass",          title: "Summarize Class",                 description: "Explain what the current class does." },
  { id: "echocode.summarizeProgram",        title: "Summarize Program",               description: "Explain what the entire program does." },
  { id: "echocode.jumpToNextFunction",      title: "Next Function",                   description: "Jump to the next function in the file." },
  { id: "echocode.jumpToPreviousFunction",  title: "Previous Function",               description: "Jump to the previous function in the file." },
  { id: "echocode.whereAmI",                title: "Where Am I",                      description: "Describe the current scope (function/class/module)." },
  { id: "echocode.increaseSpeechSpeed",     title: "Increase Speech Speed",           description: "Speak faster." },
  { id: "echocode.decreaseSpeechSpeed",     title: "Decrease Speech Speed",           description: "Speak slower." },
  { id: "echocode.stopSpeech",              title: "Stop Speech",                     description: "Stop text-to-speech playback." },
  { id: "echocode.readCurrentLine",         title: "Read Current Line",               description: "Speak the exact contents of the current line." },
  { id: "echocode.describeCurrentLine",     title: "Describe Current Line",           description: "Explain what the current line does and check for issues." },
  { id: "echocode.toggleCharacterReadOut",  title: "Toggle Character Reader",         description: "Toggle per-keystroke character read-out." },
  { id: "echocode.loadAssignmentFile",      title: "Load Assignment File",            description: "Open/upload an assignment document for task extraction." },
  { id: "echocode.readNextTask",            title: "Read Next Task",                  description: "Speak the next task from the tracker." },
  { id: "echocode.markTaskComplete",        title: "Mark Task Complete",              description: "Mark the current task complete." },
  { id: "code-tutor.analyzeBigO",           title: "Analyze Big O",                   description: "Analyze complexity and queue Big-O notes." },
  { id: "code-tutor.iterateBigOQueue",      title: "Next Big O",                      description: "Read the next Big-O recommendation." },
  { id: "code-tutor.readEntireBigOQueue",   title: "Read All Big O",                  description: "Read all Big-O recommendations in sequence." },
];

/** LLM-only router */
async function routeVoiceCommandNLU(transcript, outputChannel) {
  outputChannel?.appendLine(`[Voice/ASR] Heard: "${transcript}"`);
  const cmdId = await classifyVoiceIntent(transcript, VOICE_COMMANDS, { temperature: 0.0 });
  outputChannel?.appendLine(`[Voice/NLU] Classified => ${cmdId}`);

  if (!cmdId || cmdId === "none") {
    vscode.window.showInformationMessage(`EchoCode voice: I didn't catch a supported command for "${transcript}".`);
    return;
  }
  await vscode.commands.executeCommand(cmdId);
}

// Pylint + speech + features imports (unchanged)
const { ensurePylintInstalled, runPylint } = require("./program_settings/program_settings/pylintHandler");
const {
  speakMessage,
  stopSpeaking,
  loadSavedSpeechSpeed,
  registerSpeechCommands,
  increaseSpeechSpeed,
  decreaseSpeechSpeed,
} = require("./program_settings/speech_settings/speechHandler");
const { initializeErrorHandling, registerErrorHandlingCommands } = require("./program_features/ErrorHandling/errorHandler");
const { registerSummarizerCommands } = require("./program_features/Summarizer/summaryGenerator.js");
const { registerHotkeyGuideCommand } = require("./program_settings/guide_settings/hotkeyGuide");
const Queue = require("./program_features/Annotations_BigO/queue_system");
const { registerBigOCommand } = require("./program_features/Annotations_BigO/bigOAnalysis");
const {
  parseChatResponse,
  applyDecoration,
  clearDecorations,
  getVisibleCodeWithLineNumbers,
  annotationQueue,
  ANNOTATION_PROMPT,
  registerAnnotationCommands,
} = require("./program_features/Annotations_BigO/annotations");
const {
  loadAssignmentFile,
  readNextTask,
  rescanUserCode,
  readNextSequentialTask,
} = require("./program_features/Assignment_Tracker/assignmentTracker");
const { registerAssignmentTrackerCommands } = require("./program_features/Assignment_Tracker/assignmentTracker");
const { registerChatCommands } = require("./program_features/ChatBot/chat_tutor");
const { registerMoveCursor } = require("./navigation_features/navigationHandler");
const { registerWhereAmICommand } = require("./navigation_features/whereAmI");
const { registerReadCurrentLineCommand } = require("./program_features/WhatIsThis/WhatIsThis");
const { registerDescribeCurrentLineCommand } = require("./program_features/WhatIsThis/DescribeThis");
const { registerCharacterReadOutCommand } = require("./program_features/WhatIsThis/CharacterReadOut");

let outputChannel;
// Status bar item (read-only indicator)
let statusItem = null;

// PTT state
let pttController = null;
let pttClient = null;
let pttSafetyTimer = null;

// ===== Audio cues: system sounds on Windows; fallbacks elsewhere =====
const _cueQ = [];
let _cueBusy = false;

async function _runCueQueue() {
  if (_cueBusy) return;
  _cueBusy = true;
  try {
    while (_cueQ.length) {
      const job = _cueQ.shift();
      await job();
    }
  } finally {
    _cueBusy = false;
  }
}

/** "Mic ON" cue */
function playBeep() {
  _cueQ.push(async () => {
    try {
      if (process.platform === "win32") {
        // Use Windows system sound (Asterisk) so it's always audible via default output
        spawn("powershell", [
          "-NoProfile",
          "-Command",
          "[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null; [System.Media.SystemSounds]::Asterisk.Play()"
        ], { windowsHide: true, stdio: "ignore" });
      } else {
        // macOS/Linux fallback: brief "beep" via say
        await new Promise((res) => { try { say.speak("beep", undefined, 1.0, res); } catch (_) { res(); } });
      }
      outputChannel?.appendLine("[Cue] Mic ON sound played.");
    } catch (e) {
      outputChannel?.appendLine("[Cue] Mic ON sound error: " + (e?.message || e));
    }
  });
  _runCueQueue();
}

/** "Mic OFF" cue */
function speakMicOff() {
  _cueQ.push(async () => {
    try {
      if (process.platform === "win32") {
        // Use Windows system sound (Exclamation) for stop; more noticeable than Asterisk
        spawn("powershell", [
          "-NoProfile",
          "-Command",
          "[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null; [System.Media.SystemSounds]::Exclamation.Play()"
        ], { windowsHide: true, stdio: "ignore" });
      } else {
        // macOS/Linux fallback: "Mic off"
        await new Promise((res) => { try { say.speak("Mic off", undefined, 1.0, res); } catch (_) { res(); } });
      }
      outputChannel?.appendLine("[Cue] Mic OFF sound played.");
    } catch (e) {
      outputChannel?.appendLine("[Cue] Mic OFF sound error: " + (e?.message || e));
    }
  });
  _runCueQueue();
}

function speakMicOff() {
  _cueQ.push(() => new Promise((res) => {
    try { say.speak("Mic off", undefined, 1.0, res); }
    catch (_) { res(); }
  }));
  _runCueQueue();
}

// Context key used by keybindings
async function setPTTContext(on) {
  await vscode.commands.executeCommand("setContext", "echocode.pttRecording", !!on);
}

/** Auto-detect a reasonable Windows microphone. */
async function autoDetectWindowsMic(outputChannel) {
  return new Promise((resolve) => {
    if (process.platform !== "win32") return resolve(undefined);
    if (!ffmpegBin) {
      outputChannel?.appendLine("[Whisper] ffmpeg-static not found for device detection.");
      return resolve(undefined);
    }
    const proc = spawn(ffmpegBin, ["-list_devices", "true", "-f", "dshow", "-i", "dummy"]);
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", () => {
      const names = Array.from(stderr.matchAll(/"([^"]+)"\s*\(audio\)/g)).map((m) => m[1]);
      const filtered = names.filter((n) => !/virtual|obs|broadcast|cable|loopback|stereo\s*mix/i.test(n));
      const pick = filtered[0] || names[0];
      outputChannel?.appendLine(`[Whisper] autoDetectWindowsMic → ${pick || "none"}`);
      resolve(pick);
    });
  });
}

/** Start Push-to-Talk session */
async function startPTT(chatViewProvider) {
  if (pttController) return; // already recording
  const apiKey = process.env.API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    vscode.window.showErrorMessage("EchoCode: No OpenAI API key found in .env or system variables.");
    return;
  }

  try {
    pttClient = getOpenAIClient(apiKey);

    let deviceName;
    if (process.platform === "win32") {
      deviceName = await autoDetectWindowsMic(outputChannel);
      if (!deviceName) {
        vscode.window.showErrorMessage("EchoCode: No Windows microphone detected. Check Sound settings.");
        return;
      }
    }

    pttController = startMicCapture({ deviceName, outputChannel });
    await setPTTContext(true);

    // Update status bar indicator
    if (statusItem) {
      statusItem.text = "$(mic-filled) EchoCode Mic: Listening…";
      statusItem.tooltip = "Press Ctrl+Alt+V to stop";
    }

    // 🔊 Cue: beep on start
    playBeep();

    outputChannel.appendLine("[PTT] Recording started… (press Ctrl+Alt+V again to stop)");

    clearTimeout(pttSafetyTimer);
    pttSafetyTimer = setTimeout(() => {
      vscode.commands.executeCommand("echocode.ptt.stop");
    }, 60000);
  } catch (e) {
    outputChannel.appendLine(`[PTT] Failed to start: ${e.message}`);
    await setPTTContext(false);
    pttController = null;
    pttClient = null;
  }
}

/** Stop Push-to-Talk session, transcribe, and route */
async function stopPTT(chatViewProvider) {
  if (!pttController) return;

  try {
    clearTimeout(pttSafetyTimer);
    pttSafetyTimer = null;

    const text = await pttController.stop(pttClient);
    outputChannel.appendLine("[PTT] Recording stopped.");

    // Update status bar indicator
    if (statusItem) {
      statusItem.text = "$(mic) EchoCode Mic: Off";
      statusItem.tooltip = "Press Ctrl+Alt+V to start";
    }

    if (text && text.trim()) {
      outputChannel.appendLine(`[PTT] Transcript: ${text.trim()}`);
      await vscode.commands.executeCommand("echocode._internalVoiceRoute", text.trim());
      if (chatViewProvider && chatViewProvider._currentWebview) {
        chatViewProvider._currentWebview.postMessage({
          type: "voiceRecognitionResult",
          text: text.trim(),
        });
      }
    } else {
      vscode.window.showInformationMessage("EchoCode: No speech detected.");
    }
  } catch (e) {
    outputChannel.appendLine(`[PTT] Stop error: ${e.message}`);
    vscode.window.showErrorMessage("EchoCode: Voice stop error: " + e.message);
  } finally {
    pttController = null;
    pttClient = null;
    await setPTTContext(false);

    // 🔊 Cue: speak "Mic off" after stopping
    speakMicOff();
  }
}

async function activate(context) {
  outputChannel = vscode.window.createOutputChannel("EchoCode");
  outputChannel.appendLine("EchoCode activated.");

  // Usual setup…
  loadSavedSpeechSpeed();
  await ensurePylintInstalled();
  initializeErrorHandling(outputChannel);
  registerErrorHandlingCommands(context);
  registerAssignmentTrackerCommands(context);
  registerHotkeyGuideCommand(context);
  const chatViewProvider = registerChatCommands(context, outputChannel);

  const apiKeyBoot = process.env.API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKeyBoot) {
    vscode.window.showErrorMessage("EchoCode: No OpenAI API key found in .env or system variables.");
  }

  // Router command for transcript → action
  context.subscriptions.push(
    vscode.commands.registerCommand("echocode._internalVoiceRoute", async (transcript) => {
      try {
        if (!transcript || typeof transcript !== "string") {
          vscode.window.showInformationMessage("EchoCode: No transcript to route.");
          return;
        }
        await routeVoiceCommandNLU(transcript, outputChannel);
      } catch (e) {
        outputChannel.appendLine(`[Voice/NLU] Route error: ${e?.message || e}`);
        vscode.window.showErrorMessage("EchoCode: Voice routing failed.");
      }
    })
  );

  // Read-only status bar indicator (no command attached)
  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusItem.text = "$(mic) EchoCode Mic: Off";
  statusItem.tooltip = "Press Ctrl+Alt+V to start";
  statusItem.show();
  context.subscriptions.push(statusItem);

  // Push-to-Talk commands
  await setPTTContext(false);
  context.subscriptions.push(
    vscode.commands.registerCommand("echocode.ptt.start", async () => {
      await startPTT(chatViewProvider);
    }),
    vscode.commands.registerCommand("echocode.ptt.stop", async () => {
      await stopPTT(chatViewProvider);
    })
  );

  // Auto-stop PTT if window loses focus (prevents stuck recording)
  vscode.window.onDidChangeWindowState((state) => {
    if (!state.focused && pttController) {
      vscode.commands.executeCommand("echocode.ptt.stop");
    }
  });

  // Register remaining features
  registerBigOCommand(context);
  registerAnnotationCommands(context, outputChannel);
  registerSummarizerCommands(context, outputChannel);
  registerSpeechCommands(context, outputChannel);
  registerWhereAmICommand(context);
  registerMoveCursor(context);
  registerReadCurrentLineCommand(context);
  registerDescribeCurrentLineCommand(context);
  registerCharacterReadOutCommand(context);

  outputChannel.appendLine(
    "Commands registered: …, echocode.ptt.start, echocode.ptt.stop"
  );
}

function deactivate() {
  try { if (pttController) pttController.stop?.(); } catch (_) {}
  if (outputChannel) {
    outputChannel.appendLine("EchoCode deactivated.");
    outputChannel.dispose();
  }
}

module.exports = {
  activate,
  deactivate,
};
