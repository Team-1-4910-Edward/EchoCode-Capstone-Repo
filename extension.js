const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const { startRecording,
  stopAndTranscribe,
} = require("./program_features/Voice/whisperService");

// const { autoRouteVoiceIntent } = require("./Core/program_settings/program_settings/voiceIntentRouter");
// const { classifyVoiceIntent } = require("./Core/program_settings/program_settings/AIrequest");
const { generateCodeFromVoice } = require("./Core/program_settings/program_settings/AIrequest");

async function tryExecuteVoiceCommand(transcript, outputChannel) {
  try {
    const cleaned = transcript.toLowerCase().trim();

    // 1. Guard Clause: Ignore empty or error messages from whisper
    if (!cleaned || cleaned.includes("no speech detected")) {
      outputChannel.appendLine(`[Voice Intent] Ignored empty/error input: "${transcript}"`);
      return { handled: true }; // Treated as handled so we don't spam errors
    }

    const commandsPath = path.join(__dirname, "Core/program_settings/program_settings/voice_commands.json");
    const commands = JSON.parse(fs.readFileSync(commandsPath, "utf-8"));

    for (const cmd of commands) {
      if (cmd.keywords.some(k => cleaned.includes(k))) {
        await vscode.commands.executeCommand(cmd.id);
        vscode.window.showInformationMessage(`✅ Executed: ${cmd.title}`);
        outputChannel.appendLine(`[Voice Command] Matched: ${cmd.id}`);
        return { handled: true, command: cmd.id };
      }
    }

    // no match — pass to Copilot for Code Generation
    const editor = vscode.window.activeTextEditor;

    // 3. Check for specific "Question" keywords to route to Chat/Audio instead of Code Gen
    //    If it starts with "What", "How", "Why", "Explain", "Describe", "Does" -> likely a question.
    const questionKeywords = ["what", "how", "why", "explain", "describe", "does", "is "];
    const isQuestion = questionKeywords.some(q => cleaned.startsWith(q));

    if (isQuestion) {
      outputChannel.appendLine(`[Voice Intent] Detected Question: "${transcript}". Routing to Chat/Audio (Default).`);
      // Return handled: false so it falls through to other handlers (like chat/audio responder) if they exist,
      return { handled: false };
    }

    // 4. Otherwise, assume "Code Generation" intent (Action)
    outputChannel.appendLine(`[Voice Intent] No strict command match for: ${transcript}. Attempting Code Generation...`);

    if (editor) {
      try {
        vscode.window.showInformationMessage("EchoCode: Generating code...");

        // --- Indentation Logic ---
        const position = editor.selection.active;
        const lineText = editor.document.lineAt(position.line).text;
        const indentationMatch = lineText.match(/^\s*/);
        const currentIndentation = indentationMatch ? indentationMatch[0] : "";

        const languageId = editor.document.languageId;
        const generatedCode = await generateCodeFromVoice(transcript, languageId, currentIndentation);

        if (generatedCode) {
          await editor.edit(editBuilder => {
            editBuilder.insert(position, generatedCode);
          });
          outputChannel.appendLine(`[Voice Generation] Inserted code for: ${transcript}`);
          outputChannel.appendLine(`[Voice Generation Output]:\n${generatedCode}`);
          await speakMessage(`Here is the code I generated: ${generatedCode}`);
          return { handled: true, command: 'generateCode' };
        }
      } catch (genErr) {
        outputChannel.appendLine(`[Voice Generation Error] ${genErr.message}`);
        vscode.window.showErrorMessage(`EchoCode Generation Fail: ${genErr.message}`);
      }
    }

    return { handled: false };
  } catch (err) {
    outputChannel.appendLine(`[Voice Intent Err or] ${err.message}`);
    vscode.window.showErrorMessage(`EchoCode Voice Command Error: ${err.message}`);
    return { handled: false };
  }
}

// LLM classification approach
// async function routeVoiceCommandNLU(transcript, outputChannel) {
//   try {
//     const cleaned = transcript.toLowerCase().trim();

//     // Load command list from the SAME JSON file
//     const commandsPath = path.join(__dirname, "Core/program_settings/voice_commands.json");
//     const commands = JSON.parse(fs.readFileSync(commandsPath, "utf-8"));

//     outputChannel?.appendLine(`[Voice/ASR] Heard: "${transcript}"`);

//     // Use Copilot to classify using the JSON list
//     const cmdId = await classifyVoiceIntent(transcript, commands, { temperature: 0.0 });

//     outputChannel?.appendLine(`[Voice/NLU] Classified => ${cmdId}`);

//     // No match
//     if (!cmdId || cmdId === "none") {
//       vscode.window.showInformationMessage(
//         `EchoCode voice: I didn't catch a supported command for "${transcript}".`
//       );
//       return;
//     }

//     // Execute the matched command
//     await vscode.commands.executeCommand(cmdId);

//   } catch (err) {
//     outputChannel?.appendLine(`[Voice/NLU Error] ${err.message}`);
//   }
// }

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
