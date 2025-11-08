const vscode = require("vscode");
require("dotenv").config();

const {
  startRecording,
  stopAndTranscribe,
} = require("./program_features/Voice/whisperService");

const { autoRouteVoiceIntent } = require("./Core/program_settings/program_settings/voiceIntentRouter");
// ===== LLM voice intent routing =====
const { classifyVoiceIntent } = require("./Core/program_settings/program_settings/AIrequest");

async function tryExecuteVoiceCommand(transcript, outputChannel) {
  try {
    const t = transcript.toLowerCase().trim();

    // ========== QUICK LOCAL COMMANDS ==========
    // --- Annotations ---
    if (t.includes("toggle annotation") || t.includes("annotations")) {
      await vscode.commands.executeCommand("echocode.annotate");
      vscode.window.showInformationMessage("✅ Toggled EchoCode Annotations");
      return { handled: true, command: "echocode.annotate" };
    }

    if (t.includes("read annotations") || t.includes("read all annotations")) {
      await vscode.commands.executeCommand("echocode.readAllAnnotations");
      vscode.window.showInformationMessage("🗒️ Reading all annotations");
      return { handled: true, command: "echocode.readAllAnnotations" };
    }

    // --- Summaries ---
    if (t.includes("summarize function") || t.includes("explain function")) {
      await vscode.commands.executeCommand("echocode.summarizeFunction");
      vscode.window.showInformationMessage("🧩 Summarized function");
      return { handled: true, command: "echocode.summarizeFunction" };
    }

    if (t.includes("summarize class") || t.includes("explain class")) {
      await vscode.commands.executeCommand("echocode.summarizeClass");
      vscode.window.showInformationMessage("🏷️ Summarized class");
      return { handled: true, command: "echocode.summarizeClass" };
    }

    if (t.includes("summarize program") || t.includes("explain program") || t.includes("summarize code")) {
      await vscode.commands.executeCommand("echocode.summarizeProgram");
      vscode.window.showInformationMessage("📘 Summarized program");
      return { handled: true, command: "echocode.summarizeProgram" };
    }

    // --- Navigation ---
    if (t.includes("next function") || t.includes("go down") || t.includes("move down")) {
      await vscode.commands.executeCommand("echocode.jumpToNextFunction");
      vscode.window.showInformationMessage("➡️ Jumped to next function");
      return { handled: true, command: "echocode.jumpToNextFunction" };
    }

    if (t.includes("previous function") || t.includes("go up") || t.includes("move up")) {
      await vscode.commands.executeCommand("echocode.jumpToPreviousFunction");
      vscode.window.showInformationMessage("⬅️ Jumped to previous function");
      return { handled: true, command: "echocode.jumpToPreviousFunction" };
    }

    if (t.includes("where am i") || t.includes("what function") || t.includes("current scope")) {
      await vscode.commands.executeCommand("echocode.whereAmI");
      vscode.window.showInformationMessage("🧭 Described current scope");
      return { handled: true, command: "echocode.whereAmI" };
    }

    // --- Speech controls ---
    if (t.includes("increase speed") || t.includes("faster")) {
      await vscode.commands.executeCommand("echocode.increaseSpeechSpeed");
      vscode.window.showInformationMessage("⚡ Speech speed increased");
      return { handled: true, command: "echocode.increaseSpeechSpeed" };
    }

    if (t.includes("decrease speed") || t.includes("slower")) {
      await vscode.commands.executeCommand("echocode.decreaseSpeechSpeed");
      vscode.window.showInformationMessage("🐢 Speech speed decreased");
      return { handled: true, command: "echocode.decreaseSpeechSpeed" };
    }

    if (t.includes("stop speaking") || t.includes("stop speech") || t.includes("silence")) {
      await vscode.commands.executeCommand("echocode.stopSpeech");
      vscode.window.showInformationMessage("🔇 Speech stopped");
      return { handled: true, command: "echocode.stopSpeech" };
    }

    if (t.includes("read line") || t.includes("read current line")) {
      await vscode.commands.executeCommand("echocode.readCurrentLine");
      vscode.window.showInformationMessage("📖 Reading current line");
      return { handled: true, command: "echocode.readCurrentLine" };
    }

    if (t.includes("describe line") || t.includes("explain line")) {
      await vscode.commands.executeCommand("echocode.describeCurrentLine");
      vscode.window.showInformationMessage("🧠 Described current line");
      return { handled: true, command: "echocode.describeCurrentLine" };
    }

    // --- Character readout toggle ---
    if (t.includes("toggle character") || t.includes("character mode")) {
      await vscode.commands.executeCommand("echocode.toggleCharacterReadOut");
      vscode.window.showInformationMessage("🔤 Toggled character read-out mode");
      return { handled: true, command: "echocode.toggleCharacterReadOut" };
    }

    // --- Assignment tracker ---
    if (t.includes("load assignment") || t.includes("open assignment")) {
      await vscode.commands.executeCommand("echocode.loadAssignmentFile");
      vscode.window.showInformationMessage("📂 Assignment file loaded");
      return { handled: true, command: "echocode.loadAssignmentFile" };
    }

    if (t.includes("next task") || t.includes("read task")) {
      await vscode.commands.executeCommand("echocode.readNextTask");
      vscode.window.showInformationMessage("🧾 Reading next task");
      return { handled: true, command: "echocode.readNextTask" };
    }

    if (t.includes("mark complete") || t.includes("task done")) {
      await vscode.commands.executeCommand("echocode.markTaskComplete");
      vscode.window.showInformationMessage("✅ Task marked complete");
      return { handled: true, command: "echocode.markTaskComplete" };
    }

    // --- File / Folder ---
    if (t.includes("create folder") || t.includes("new folder") || t.includes("make folder")) {
      await vscode.commands.executeCommand("echocode.createFolder");
      vscode.window.showInformationMessage("📁 Created new folder");
      return { handled: true, command: "echocode.createFolder" };
    }

    // if (t.includes("create file") || t.includes("new file") || t.includes("make file")) {
    //   await vscode.commands.executeCommand("echocode.createFile");
    //   vscode.window.showInformationMessage("📄 Created new file");
    //   return { handled: true, command: "echocode.createFile" };
    // }

    if (t.includes("next file") || t.includes("go to next file")) {
      await vscode.commands.executeCommand("echocode.navigateToNextFile");
      vscode.window.showInformationMessage("📂 Moved to next file");
      return { handled: true, command: "echocode.navigateToNextFile" };
    }

    if (t.includes("next folder") || t.includes("go to next folder")) {
      await vscode.commands.executeCommand("echocode.moveToNextFolder");
      vscode.window.showInformationMessage("📁 Moved to next folder");
      return { handled: true, command: "echocode.moveToNextFolder" };
    }

    if (t.includes("previous folder") || t.includes("go back folder")) {
      await vscode.commands.executeCommand("echocode.moveToPreviousFolder");
      vscode.window.showInformationMessage("📁 Moved to previous folder");
      return { handled: true, command: "echocode.moveToPreviousFolder" };
    }

    // --- File connector ---
    if (t.includes("copy import") || t.includes("copy file name")) {
      await vscode.commands.executeCommand("echocode.copyFileNameForImport");
      vscode.window.showInformationMessage("📋 Copied file name for import");
      return { handled: true, command: "echocode.copyFileNameForImport" };
    }

    if (t.includes("paste import") || t.includes("insert import")) {
      await vscode.commands.executeCommand("echocode.pasteImportAtCursor");
      vscode.window.showInformationMessage("📥 Pasted import at cursor");
      return { handled: true, command: "echocode.pasteImportAtCursor" };
    }

    // --- Chat + Help ---
    if (t.includes("open chat") || t.includes("tutor") || t.includes("assistant")) {
      await vscode.commands.executeCommand("echocode.openChat");
      vscode.window.showInformationMessage("💬 Opened EchoCode Tutor");
      return { handled: true, command: "echocode.openChat" };
    }

    if (t.includes("hotkey guide") || t.includes("help menu") || t.includes("keyboard help")) {
      await vscode.commands.executeCommand("echocode.hotkeyGuide");
      vscode.window.showInformationMessage("⌨️ Opened hotkey guide");
      return { handled: true, command: "echocode.hotkeyGuide" };
    }

    if (t.includes("summarize function")) {
      await vscode.commands.executeCommand("echocode.summarizeFunction");
      vscode.window.showInformationMessage("✅ Summarized Function");
      return { handled: true, command: "echocode.summarizeFunction" };
    }

    // ========== FALLBACK: AI / LLM CLASSIFICATION ==========
    outputChannel.appendLine(`[Voice Intent] Testing local classifier with: ${transcript}`);
    const { classifyLocalIntent } = require("./Core/program_settings/program_settings/localIntentRouter");
    const cleaned = transcript.toLowerCase().replace(/[^\w\s]/g, "").trim();
    outputChannel.appendLine(`[Local NLU] Cleaned transcript: ${cleaned}`);
    const cmdId = await classifyLocalIntent(transcript, VOICE_COMMANDS);
    outputChannel.appendLine(`[Local NLU] Best match: ${cmdId}`);
    // if (cmdId === "none") {
    //   const { classifyVoiceIntent } = require("./Core/program_settings/program_settings/AIrequest");
    //   cmdId = await classifyVoiceIntent(transcript, VOICE_COMMANDS);
    // }
    if (cmdId && cmdId !== "none") {
      const match = VOICE_COMMANDS.find(c => c.id === cmdId);
      const title = match ? match.title : cmdId;
      await vscode.commands.executeCommand(cmdId);
      vscode.window.showInformationMessage(`✅ Executed command: ${title}`);
      return { handled: true, command: cmdId };
    }

    // No match found
    outputChannel.appendLine(`[Voice Intent] No match for: ${transcript}`);
    vscode.window.showInformationMessage(`🤔 I couldn't match "${transcript}" to any EchoCode command.`);
    return { handled: false };

  } catch (err) {
    outputChannel.appendLine(`[Voice Intent Error] ${err.message}`);
    vscode.window.showErrorMessage(`EchoCode Voice Command Error: ${err.message}`);
    return { handled: false };
  }
}

/** Catalog of voice-routable commands */
const VOICE_COMMANDS = [
  // === Core Annotation + Big O ===
  { id: "echocode.annotate",                title: "Toggle EchoCode Annotations",     description: "Generate or toggle inline annotations for this file." },
  { id: "echocode.readAllAnnotations",      title: "Read All Annotations",            description: "Speak all annotations currently in the queue." },
  { id: "code-tutor.analyzeBigO",           title: "Analyze Big O",                   description: "Analyze complexity and queue Big-O notes." },
  { id: "code-tutor.iterateBigOQueue",      title: "Next Big O",                      description: "Read the next Big-O recommendation." },
  { id: "code-tutor.readEntireBigOQueue",   title: "Read All Big O",                  description: "Read all Big-O recommendations in sequence." },

  // === Summarization ===
  { id: "echocode.summarizeFunction",       title: "Summarize Function",              description: "Explain what the current function does." },
  { id: "echocode.summarizeClass",          title: "Summarize Class",                 description: "Explain what the current class does." },
  { id: "echocode.summarizeProgram",        title: "Summarize Program",               description: "Explain what the entire program does." },

  // === Navigation ===
  { id: "echocode.jumpToNextFunction",      title: "Next Function",                   description: "Jump to the next function in the file." },
  { id: "echocode.jumpToPreviousFunction",  title: "Previous Function",               description: "Jump to the previous function in the file." },
  { id: "echocode.whereAmI",                title: "Where Am I",                      description: "Describe the current scope (function/class/module)." },

  // === Speech Controls ===
  { id: "echocode.increaseSpeechSpeed",     title: "Increase Speech Speed",           description: "Speak faster." },
  { id: "echocode.decreaseSpeechSpeed",     title: "Decrease Speech Speed",           description: "Speak slower." },
  { id: "echocode.stopSpeech",              title: "Stop Speech",                     description: "Stop text-to-speech playback." },
  { id: "echocode.readCurrentLine",         title: "Read Current Line",               description: "Speak the exact contents of the current line." },
  { id: "echocode.describeCurrentLine",     title: "Describe Current Line",           description: "Explain what the current line does and check for issues." },
  { id: "echocode.toggleCharacterReadOut",  title: "Toggle Character Reader",         description: "Toggle per-keystroke character read-out." },

  // === Assignment Tracker ===
  { id: "echocode.loadAssignmentFile",      title: "Load Assignment File",            description: "Open/upload an assignment document for task extraction." },
  { id: "echocode.readNextTask",            title: "Read Next Task",                  description: "Speak the next task from the tracker." },
  { id: "echocode.markTaskComplete",        title: "Mark Task Complete",              description: "Mark the current task as complete." },

  // === Chat + Voice ===
  { id: "echocode.openChat",                title: "Open EchoCode Tutor",             description: "Open the EchoCode Tutor chat interface." },
  { id: "echocode.startVoiceInput",         title: "Start Voice Input",               description: "Start voice input for asking the EchoCode Tutor a question." },

  // === File & Folder Operations ===
  { id: "echocode.createFile",              title: "Create New File",                 description: "Create a new file in the current folder." },
  { id: "echocode.createFolder",            title: "Create New Folder",               description: "Create a new folder in the workspace." },
  { id: "echocode.navigateToNextFile",      title: "Next File",                       description: "Move to the next file in the current folder." },
  { id: "echocode.moveToNextFolder",        title: "Next Folder",                     description: "Navigate to the next folder in the workspace." },
  { id: "echocode.moveToPreviousFolder",    title: "Previous Folder",                 description: "Navigate to the previous folder in the workspace." },

  // === File Connector ===
  { id: "echocode.copyFileNameForImport",   title: "Copy File Name for Import",       description: "Copy the current file name for import in Python or C++." },
  { id: "echocode.pasteImportAtCursor",     title: "Paste Import at Cursor",          description: "Paste a prepared import statement at the cursor position." },

  // === Hotkey Guide ===
  { id: "echocode.hotkeyGuide",             title: "Hotkey Guide",                    description: "Read out the available keyboard shortcut options interactively." },
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

module.exports = { activate, deactivate, tryExecuteVoiceCommand };
