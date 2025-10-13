const vscode = require("vscode");
const path = require("path");
const { spawn } = require("child_process");
const ffmpegBin = require("ffmpeg-static");
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

// Set up and run Pylint
const {
  ensurePylintInstalled,
  runPylint,
} = require("./program_settings/program_settings/pylintHandler");

const {
  speakMessage,
  stopSpeaking,
  loadSavedSpeechSpeed,
  registerSpeechCommands,
  increaseSpeechSpeed,
  decreaseSpeechSpeed,
} = require("./program_settings/speech_settings/speechHandler");

// Error handling
const {
  initializeErrorHandling,
  registerErrorHandlingCommands,
} = require("./program_features/ErrorHandling/errorHandler");

const {
  registerSummarizerCommands,
} = require("./program_features/Summarizer/summaryGenerator.js");

const {
  registerHotkeyGuideCommand,
} = require("./program_settings/guide_settings/hotkeyGuide");
const Queue = require("./program_features/Annotations_BigO/queue_system");
const {
  registerBigOCommand,
} = require("./program_features/Annotations_BigO/bigOAnalysis");
const {
  parseChatResponse,
  applyDecoration,
  clearDecorations,
  getVisibleCodeWithLineNumbers,
  annotationQueue, // Unused?
  ANNOTATION_PROMPT, // Unused?
  registerAnnotationCommands,
} = require("./program_features/Annotations_BigO/annotations");

const {
  loadAssignmentFile,
  readNextTask,
  rescanUserCode,
  readNextSequentialTask,
} = require("./program_features/Assignment_Tracker/assignmentTracker");
const {
  registerAssignmentTrackerCommands,
} = require("./program_features/Assignment_Tracker/assignmentTracker");

const {
  registerChatCommands,
} = require("./program_features/ChatBot/chat_tutor");

// Navigation features
const {
  registerMoveCursor,
} = require("./navigation_features/navigationHandler");
const { registerWhereAmICommand } = require("./navigation_features/whereAmI");
const {
  registerReadCurrentLineCommand,
} = require("./program_features/WhatIsThis/WhatIsThis");
const {
  registerDescribeCurrentLineCommand,
} = require("./program_features/WhatIsThis/DescribeThis");
const {
  registerCharacterReadOutCommand,
} = require("./program_features/WhatIsThis/CharacterReadOut");

let activeDecorations = [];
let annotationsVisible = false;

let outputChannel;
let debounceTimer = null;
let isRunning = false;

// Mic toggle state (status bar)
let isMicOn = false;
let micController = null;
let statusItem = null;

// PTT state
let pttController = null;
let pttClient = null;
let pttSafetyTimer = null;

// --- helpers for context gating the keybindings ---
async function setPTTContext(on) {
  await vscode.commands.executeCommand("setContext", "echocode.pttRecording", !!on);
}

/** OPTION 1: Auto-detect a reasonable Windows microphone.
 *  - Lists dshow devices with ffmpeg and picks the first "real" mic (filters virtual/loopback).
 *  - Returns undefined on non-Windows (so platform defaults apply).
 */
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
      // capture names like:  "Microphone (Yeti Stereo Microphone)" (audio)
      const names = Array.from(stderr.matchAll(/"([^"]+)"\s*\(audio\)/g)).map((m) => m[1]);
      // filter out common virtual devices
      const filtered = names.filter(
        (n) => !/virtual|obs|broadcast|cable|loopback|stereo\s*mix/i.test(n)
      );
      const pick = filtered[0] || names[0]; // fallback to first if nothing filtered
      outputChannel?.appendLine(`[Whisper] autoDetectWindowsMic → ${pick || "none"}`);
      resolve(pick); // may be undefined if nothing found
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

    // Auto-pick a "real" device on Windows; let other platforms default
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
    outputChannel.appendLine("[PTT] Recording started… (press Ctrl+Alt+V again to stop)");

    // optional safety cutoff (e.g., 60s)
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
    if (text && text.trim()) {
      outputChannel.appendLine(`[PTT] Transcript: ${text.trim()}`);
      // Route to your existing internal router
      await vscode.commands.executeCommand("echocode._internalVoiceRoute", text.trim());

      // Mirror to chat webview if present
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
  }
}

async function activate(context) {
  outputChannel = vscode.window.createOutputChannel("EchoCode");
  outputChannel.appendLine("EchoCode activated.");
  loadSavedSpeechSpeed();
  await ensurePylintInstalled();
  initializeErrorHandling(outputChannel);
  outputChannel.appendLine("Pylint installed and initialized.");
  registerErrorHandlingCommands(context);
  outputChannel.appendLine("Error handling commands registered.");

  // Register assignment tracker commands
  registerAssignmentTrackerCommands(context);

  // Register hotkey guide command
  registerHotkeyGuideCommand(context);

  // Register chat commands
  const chatViewProvider = registerChatCommands(context, outputChannel);

  // Early API key nudge
  const apiKeyBoot = process.env.API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKeyBoot) {
    vscode.window.showErrorMessage("EchoCode: No OpenAI API key found in .env or system variables.");
  }

  // --- Internal voice router command (so executeCommand(...) works) ---
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

  // Status bar item for mic (your existing toggle)
  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusItem.command = "echocode.toggleMic";
  statusItem.text = "$(mic) EchoCode Mic: Off";
  statusItem.tooltip = "Toggle EchoCode Microphone (Ctrl+Alt+M)";
  statusItem.show();
  context.subscriptions.push(statusItem);

  // Toggle mic command (continuous STT)
  context.subscriptions.push(
    vscode.commands.registerCommand("echocode.toggleMic", async () => {
      try {
        const apiKey = process.env.API_KEY || process.env.OPENAI_API_KEY;
        if (!apiKey) {
          vscode.window.showErrorMessage("EchoCode: No OpenAI API key found.");
          return;
        }
        const client = getOpenAIClient(apiKey);

        if (!isMicOn) {
          outputChannel.appendLine("[Whisper] Starting microphone...");

          // Auto-pick a real mic on Windows
          let deviceName;
          if (process.platform === "win32") {
            deviceName = await autoDetectWindowsMic(outputChannel);
            if (!deviceName) {
              vscode.window.showErrorMessage("EchoCode: No Windows microphone detected. Check Sound settings.");
              return;
            }
          }

          micController = startMicCapture({
            deviceName,
            outputChannel,
          });
          isMicOn = true;
          statusItem.text = "$(mic-filled) EchoCode Mic: Listening… (Ctrl+Alt+M to stop)";
        } else {
          outputChannel.appendLine("[Whisper] Stopping microphone, transcribing...");
          const transcript = await micController.stop(client);
          isMicOn = false;
          micController = null;
          statusItem.text = "$(mic) EchoCode Mic: Off";

          if (transcript) {
            outputChannel.appendLine(`[Whisper] Transcript: ${transcript}`);
            // Route to your existing internal router
            vscode.commands.executeCommand("echocode._internalVoiceRoute", transcript);

            // Also show in chat webview
            if (chatViewProvider && chatViewProvider._currentWebview) {
              chatViewProvider._currentWebview.postMessage({
                type: "voiceRecognitionResult",
                text: transcript,
              });
            }
          } else {
            vscode.window.showInformationMessage("EchoCode: No speech detected.");
          }
        }
      } catch (err) {
        isMicOn = false;
        micController = null;
        statusItem.text = "$(mic) EchoCode Mic: Off";
        vscode.window.showErrorMessage("EchoCode Whisper STT error: " + (err?.message || err));
        outputChannel.appendLine("[Whisper] Error: " + (err?.message || err));
      }
    })
  );

  // Legacy one-shot STT command (records ~5s, transcribes, routes)
  context.subscriptions.push(
    vscode.commands.registerCommand("echocode._startWhisperSTT", async () => {
      try {
        const apiKey = process.env.API_KEY || process.env.OPENAI_API_KEY;
        if (!apiKey) {
          vscode.window.showErrorMessage("EchoCode: No OpenAI API key found.");
          return;
        }

        // Auto-pick a real mic on Windows
        let deviceName;
        if (process.platform === "win32") {
          deviceName = await autoDetectWindowsMic(outputChannel);
          if (!deviceName) {
            vscode.window.showErrorMessage("EchoCode: No Windows microphone detected. Check Sound settings.");
            return;
          }
        }

        const transcript = await recordAndTranscribe(apiKey, outputChannel, {
          deviceName,
          durationMs: 5000,
        });

        if (transcript) {
          vscode.commands.executeCommand("echocode._internalVoiceRoute", transcript);

          if (chatViewProvider && chatViewProvider._currentWebview) {
            chatViewProvider._currentWebview.postMessage({
              type: "voiceRecognitionResult",
              text: transcript,
            });
          }
        } else {
          vscode.window.showInformationMessage("EchoCode: No speech detected.");
        }
      } catch (err) {
        vscode.window.showErrorMessage("EchoCode Whisper STT error: " + (err?.message || err));
        outputChannel.appendLine("[Whisper] Error: " + (err?.message || err));

        if (chatViewProvider && chatViewProvider._currentWebview) {
          chatViewProvider._currentWebview.postMessage({
            type: "voiceRecognitionError",
            error: err?.message || String(err),
          });
        }
      }
    })
  );

  // ===== Push-to-Talk (Ctrl+Alt+V press/press toggle via context key) =====
  await setPTTContext(false);
  context.subscriptions.push(
    vscode.commands.registerCommand("echocode.ptt.start", async () => {
      await startPTT(chatViewProvider);
    }),
    vscode.commands.registerCommand("echocode.ptt.stop", async () => {
      await stopPTT(chatViewProvider);
    })
  );

  // Optional: auto-stop PTT if window loses focus (prevents stuck recording)
  vscode.window.onDidChangeWindowState((state) => {
    if (!state.focused && pttController) {
      vscode.commands.executeCommand("echocode.ptt.stop");
    }
  });

  // Register Big O commands
  registerBigOCommand(context);

  // Register annotation commands
  registerAnnotationCommands(context, outputChannel);

  // Register summarizer commands
  registerSummarizerCommands(context, outputChannel);

  // Register speech commands
  registerSpeechCommands(context, outputChannel);

  // Navigation commands
  registerWhereAmICommand(context);
  registerMoveCursor(context);

  // What is this commands
  registerReadCurrentLineCommand(context);
  registerDescribeCurrentLineCommand(context);
  registerCharacterReadOutCommand(context);

  outputChannel.appendLine(
    "Commands registered: echocode.readErrors, echocode.annotate, echocode.speakNextAnnotation, echocode.readAllAnnotations, echocode.summarizeClass, echocode.summarizeFunction, echocode.jumpToNextFunction, echocode.jumpToPreviousFunction, echocode.openChat, echocode.startVoiceInput, echocode.loadAssignmentFile, echocode.rescanUserCode, echocode.readNextSequentialTask, echocode.increaseSpeechSpeed, echocode.decreaseSpeechSpeed, echocode.ptt.start, echocode.ptt.stop"
  );
}

function deactivate() {
  try { if (micController) micController.stop?.(); } catch (_) {}
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
