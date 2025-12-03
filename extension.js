const vscode = require("vscode");

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
