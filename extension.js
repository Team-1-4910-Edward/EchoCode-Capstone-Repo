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
const { registerReadCurrentLineCommand } = require("./program_features/WhatIsThis/WhatIsThis");
const { registerDescribeCurrentLineCommand } = require("./program_features/WhatIsThis/DescribeThis");
const { registerCharacterReadOutCommand } = require("./program_features/WhatIsThis/CharacterReadOut");

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
  registerReadCurrentLineCommand(context);
  registerDescribeCurrentLineCommand(context);
  registerCharacterReadOutCommand(context);


  // OPTIONAL: Python adapter (don’t hard-fail if Pylint missing)
  try {
    await ensurePylintInstalled();
    initializeErrorHandling(outputChannel);
    registerErrorHandlingCommands(context);
    outputChannel.appendLine("[EchoCode] Python adapter ready (Pylint).");
  } catch (e) {
    outputChannel.appendLine("[EchoCode] Pylint not available — skipping Python-specific extras.");
  }

  outputChannel.appendLine("[EchoCode] Commands registered.");
}

function deactivate() {
  if (outputChannel) {
    outputChannel.appendLine("[EchoCode] Deactivated");
    outputChannel.dispose();
  }
}

module.exports = { activate, deactivate };
