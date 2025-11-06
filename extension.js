const vscode = require("vscode");
require("dotenv").config();

const {
  startRecording,
  stopAndTranscribe,
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

// Python (optional adapter)
const { ensurePylintInstalled } = require("./Language/Python/pylintHandler");
const { initializeErrorHandling, registerErrorHandlingCommands } = require("./Language/Python/errorHandler");

// Speech (core)
const {
  speakMessage,
  stopSpeaking,
  loadSavedSpeechSpeed,
  registerSpeechCommands,
  increaseSpeechSpeed,
  decreaseSpeechSpeed,
} = require("./Core/program_settings/speech_settings/speechHandler");

// Core features
const { registerSummarizerCommands } = require("./Core/Summarizer/summaryGenerator.js");
const { registerHotkeyGuideCommand } = require("./Core/program_settings/guide_settings/hotkeyGuide");
const { registerChatCommands } = require("./program_features/ChatBot/chat_tutor");

// Navigation + “What’s this”
const { registerMoveCursor } = require("./navigation_features/navigationHandler");
const { registerWhereAmICommand } = require("./navigation_features/whereAmI");
const {
  registerFileCreatorCommand,
} = require("./program_features/Folder_File_Creator/FileCreator");
const {
  registerFolderCreatorCommand,
} = require("./program_features/Folder_File_Creator/FolderCreator");
const {
  registerFileNavigatorCommand,
} = require("./navigation_features/Folder_File_Navigator/file_navigator");
const {
  initializeFolderList,
  registerFolderNavigatorCommands,
} = require("./navigation_features/Folder_File_Navigator/folder_navigator");
const {
  registerReadCurrentLineCommand,
} = require("./program_features/WhatIsThis/WhatIsThis");
const {
  registerDescribeCurrentLineCommand,
} = require("./program_features/WhatIsThis/DescribeThis");
const {
  registerCharacterReadOutCommand,
} = require("./program_features/WhatIsThis/CharacterReadOut");

const {
  connectFile,
  handleCopyFileNameCommand,
  handlePasteImportCommand,
  registerFileConnectorCommands,
} = require("./program_features/FileConnector/File_Connector");

// Big-O + Annotations
const { registerBigOCommand } = require("./program_features/Annotations_BigO/bigOAnalysis");
const { registerAnnotationCommands } = require("./program_features/Annotations_BigO/annotations");

// Assignment tracker
const { registerAssignmentTrackerCommands } = require("./program_features/Assignment_Tracker/assignmentTracker");

let outputChannel;

async function activate(context) {
  outputChannel = vscode.window.createOutputChannel("EchoCode");
  outputChannel.appendLine("[EchoCode] Activated");

  // Speech prefs
  loadSavedSpeechSpeed();

  // Register core commands first (code-agnostic)
  registerSpeechCommands(context, outputChannel);
  registerSummarizerCommands(context, outputChannel);
  registerHotkeyGuideCommand(context);
  registerChatCommands(context, outputChannel);
  
  // start recording (no transcript yet)
  context.subscriptions.push(
    vscode.commands.registerCommand("echocode._voiceStart", async () => {
      startRecording(outputChannel); // starts if not already running
    })
  );

  // stop recording and transcribe (returns text)
  context.subscriptions.push(
    vscode.commands.registerCommand("echocode._voiceStop", async () => {
    try {
      const text = await stopAndTranscribe(outputChannel);
      return { ok: true, text };
    } catch (err) {
      const msg = (err && err.message) ? err.message : String(err);
      vscode.window.showErrorMessage("EchoCode Whisper STT error: " + msg);
      outputChannel.appendLine("[Whisper] Error: " + msg);
      return { ok: false, error: msg };
    }
  })
  );
  registerBigOCommand(context);
  registerAnnotationCommands(context, outputChannel);
  registerAssignmentTrackerCommands(context);
  registerWhereAmICommand(context);
  registerMoveCursor(context);
  registerFileCreatorCommand(context);
  registerFolderCreatorCommand(context);
  registerFileNavigatorCommand(context);
  registerFolderNavigatorCommands(context);

  // What is this commands
  registerReadCurrentLineCommand(context);
  registerDescribeCurrentLineCommand(context);
  registerCharacterReadOutCommand(context);

  // Register file connector commands
  registerFileConnectorCommands(context, vscode);

  outputChannel.appendLine(
    "Commands registered: echocode.readErrors, echocode.annotate, echocode.speakNextAnnotation, echocode.readAllAnnotations, echocode.summarizeClass, echocode.summarizeFunction, echocode.jumpToNextFunction, echocode.jumpToPreviousFunction, echocode.openChat, echocode.startVoiceInput, echocode.loadAssignmentFile, echocode.rescanUserCode, echocode.readNextSequentialTask, echocode.increaseSpeechSpeed, echocode.decreaseSpeechSpeed, echocode.moveToNextFolder, echocode.moveToPreviousFolder"
  );

  // Initialize folder list when the extension starts
  initializeFolderList();

  // Listen for workspace folder changes and reinitialize the folder list
  vscode.workspace.onDidChangeWorkspaceFolders(() => {
    outputChannel.appendLine(
      "Workspace folders changed. Reinitializing folder list..."
    );
    initializeFolderList();
  });
}

function deactivate() {
  if (outputChannel) {
    outputChannel.appendLine("[EchoCode] Deactivated");
    outputChannel.dispose();
  }
}

module.exports = { activate, deactivate };
