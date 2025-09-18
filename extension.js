const vscode = require("vscode");
require("dotenv").config();

const { recordAndTranscribe } = require("./program_features/Voice/whisperService");

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
  context.subscriptions.push(
    vscode.commands.registerCommand("echocode._startWhisperSTT", async () => {
      try {
        const apiKey = process.env.API_KEY;
        if (!apiKey) {
          vscode.window.showErrorMessage("EchoCode: No OpenAI API key found.");
          return;
        }

        const transcript = await recordAndTranscribe(apiKey, outputChannel);
        if (transcript) {
          // 1. Route transcript through your LLM → execute command
          vscode.commands.executeCommand("echocode._internalVoiceRoute", transcript);

          // 2. ALSO send transcript back to chat webview to show in UI
          if (chatViewProvider && chatViewProvider._currentWebview) {
            chatViewProvider._currentWebview.postMessage({
              type: "voiceRecognitionResult",
              text: transcript
            });
          }
        }
      } catch (err) {
        vscode.window.showErrorMessage("EchoCode Whisper STT error: " + err.message);
        outputChannel.appendLine("[Whisper] Error: " + err.message);

        // Inform the webview about the error
        if (chatViewProvider && chatViewProvider._currentWebview) {
          chatViewProvider._currentWebview.postMessage({
            type: "voiceRecognitionError",
            error: err.message
          });
        }
      }
    })
  );

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
    "Commands registered: echocode.readErrors, echocode.annotate, echocode.speakNextAnnotation, echocode.readAllAnnotations, echocode.summarizeClass, echocode.summarizeFunction, echocode.jumpToNextFunction, echocode.jumpToPreviousFunction, echocode.openChat, echocode.startVoiceInput, echocode.loadAssignmentFile, echocode.rescanUserCode, echocode.readNextSequentialTask, echocode.increaseSpeechSpeed, echocode.decreaseSpeechSpeed"
  );
}

function deactivate() {
  if (outputChannel) {
    outputChannel.appendLine("EchoCode deactivated.");
    outputChannel.dispose();
  }
}

module.exports = {
  activate,
  deactivate,
};
