const vscode = require("vscode");
const Queue = require("./queue_system");
const {
  speakMessage,
} = require("../../Core/program_settings/speech_settings/speechHandler"); // Add this import

const {
  formatHelpByGuidance,
} = require("../../Core/program_settings/guide_settings/guidanceLevel");


let activeDecorations = [];
const annotationQueue = new Queue();
let annotationsVisible = false;
const ANNOTATION_PROMPT = `You are an EchoCode tutor who helps students learn how to write better code. Your job is to evaluate a block of code that the user gives you. You will then annotate any lines that could be improved with a brief suggestion and the reason why you are making that suggestion. Only make suggestions when you feel the severity is enough that it will impact the readability and maintainability of the code. Be friendly with your suggestions and remember that these are students so they need gentle guidance. Format each suggestion as a single JSON object. It is not necessary to wrap your response in triple backticks. Here is an example of what your response should look like:

{ "line": 1, "suggestion": "I think you should use a for loop instead of a while loop. A for loop is more concise and easier to read." }{ "line": 12, "suggestion": "I think you should use a for loop instead of a while loop. A for loop is more concise and easier to read." }
`;

// Add function to get entire file instead of just visible code
function getEntireFileWithLineNumbers(textEditor) {
  const documentLineCount = textEditor.document.lineCount;
  let code = "";
  for (let lineNumber = 0; lineNumber < documentLineCount; lineNumber++) {
    code += `${lineNumber + 1}: ${
      textEditor.document.lineAt(lineNumber).text
    }\n`;
  }
  return code;
}

function firstSentence(text) {
  if (!text) return "";
  const t = String(text).replace(/\s+/g, " ").trim();
  const m = t.match(/^(.+?[.!?])(\s|$)/);
  return m ? m[1].trim() : t;
}

function toStepsFromSuggestion(suggestion) {
  // Simple heuristic to convert a long suggestion into 1–2 “steps”
  const s = String(suggestion || "").replace(/\s+/g, " ").trim();
  if (!s) return [];
  const parts = s.split(/(?:\.\s+|\n+)/).map(p => p.trim()).filter(Boolean);

  // Pick 1–2 actionable-looking pieces
  return parts.slice(0, 2).map(p => p.endsWith(".") ? p : `${p}.`);
}

async function parseChatResponse(chatResponse, textEditor) {
  let accumulatedResponse = "";
  for await (const fragment of chatResponse.text) {
    accumulatedResponse += fragment;
    if (fragment.includes("}")) {
      try {
        const annotation = JSON.parse(accumulatedResponse);
        applyDecoration(textEditor, annotation.line, annotation.suggestion);
        const annotationData = {
          line: annotation.line,
          suggestion: annotation.suggestion,
        };
        annotationQueue.enqueue(annotationData); // Enqueue the annotation

        // Log the annotation being added to the queue
        console.log(
          `Annotation added to queue: Line ${annotation.line}, Suggestion: ${annotation.suggestion}`
        );
        accumulatedResponse = "";
      } catch (error) {
        console.error("Failed to parse annotation:", error.message);
      }
    }
  }

  // Log the entire queue after processing
  console.log("Current annotation queue:", annotationQueue.items);
}

function applyDecoration(editor, line, suggestion) {
  const decorationType = vscode.window.createTextEditorDecorationType({
    after: {
      contentText: ` ${suggestion.substring(0, 25) + "..."}`,
      color: "grey",
    },
  });
  const lineLength = editor.document.lineAt(line - 1).text.length;
  const range = new vscode.Range(
    new vscode.Position(line - 1, lineLength),
    new vscode.Position(line - 1, lineLength)
  );
  editor.setDecorations(decorationType, [
    { range: range, hoverMessage: suggestion },
  ]);

  activeDecorations.push({
    decorationType,
    editor,
  });
}

function clearDecorations() {
  for (const decoration of activeDecorations) {
    decoration.editor.setDecorations(decoration.decorationType, []);
  }
  activeDecorations = [];
}

function getVisibleCodeWithLineNumbers(textEditor) {
  let currentLine = textEditor.visibleRanges[0].start.line;
  const endLine = textEditor.visibleRanges[0].end.line;
  let code = "";
  while (currentLine < endLine) {
    code += `${currentLine + 1}: ${
      textEditor.document.lineAt(currentLine).text
    }\n`;
    currentLine++;
  }
  return code;
}

// Consolidated function to register all annotation-related commands
function registerAnnotationCommands(context, outputChannel) {
  // Command to create annotations
  const annotateCommand = vscode.commands.registerTextEditorCommand(
    "echocode.annotate",
    async (textEditor) => {
      outputChannel.appendLine("echocode.annotate command triggered");

      if (annotationsVisible) {
        clearDecorations();
        annotationQueue.clear();
        annotationsVisible = false;
        vscode.window.showInformationMessage("Annotations cleared");
        return;
      }

      try {
        // Use entire file content instead of just visible content
        const codeWithLineNumbers = getEntireFileWithLineNumbers(textEditor);

        // Show a status bar message to indicate annotation is in progress
        const statusBarMessage = vscode.window.setStatusBarMessage(
          "$(loading~spin) EchoCode is analyzing your file..."
        );

        const [model] = await vscode.lm.selectChatModels({
          vendor: "copilot",
          family: "gpt-4o",
        });
        if (!model) {
          statusBarMessage.dispose();
          vscode.window.showErrorMessage(
            "No language model available. Please ensure Copilot is enabled."
          );
          outputChannel.appendLine("No language model available");
          return;
        }
        const messages = [
          new vscode.LanguageModelChatMessage(0, ANNOTATION_PROMPT),
          new vscode.LanguageModelChatMessage(0, codeWithLineNumbers),
        ];
        const chatResponse = await model.sendRequest(
          messages,
          {},
          new vscode.CancellationTokenSource().token
        );
        await parseChatResponse(chatResponse, textEditor);
        annotationsVisible = true;

        // Dispose of the status bar message
        statusBarMessage.dispose();
        vscode.window.setStatusBarMessage(
          "EchoCode finished analyzing your code",
          3000
        );
        outputChannel.appendLine("Annotations applied successfully");
      } catch (error) {
        outputChannel.appendLine("Error in annotate command: " + error.message);
        vscode.window.showErrorMessage(
          "Failed to annotate code: " + error.message
        );
      }
    }
  );

  // Command to speak the next annotation
  const speakNextAnnotationCommand = vscode.commands.registerCommand(
    "echocode.speakNextAnnotation",
    async () => {
      outputChannel.appendLine(
        "echocode.speakNextAnnotation command triggered"
      );
      if (!annotationQueue.isEmpty()) {
        const nextAnnotation = annotationQueue.dequeue();
        const short = firstSentence(nextAnnotation.suggestion);
        const steps = toStepsFromSuggestion(nextAnnotation.suggestion);

        const spoken = formatHelpByGuidance({
          where: `Line ${nextAnnotation.line}`,
          summary: short,                         // no “Suggestion:” label
          raw: nextAnnotation.suggestion,         // concise reads the raw idea
          ruleHint: "",                           // don’t repeat generic fluff
          suggestions: steps                      // guided/balanced can say “Next/Then” if your formatter supports it
        });

        vscode.window.showInformationMessage(
          `Annotation on line ${nextAnnotation.line}: ${nextAnnotation.suggestion}`
        );
        await speakMessage(spoken);
      } else {
        vscode.window.showInformationMessage("No more annotations to read.");
        await speakMessage("No more annotations to read.");
      }
    }
  );

  // Command to read all annotations
  const readAllAnnotationsCommand = vscode.commands.registerCommand(
    "echocode.readAllAnnotations",
    async () => {
      outputChannel.appendLine("Reading all annotations aloud...");
      const annotations = annotationQueue.items;
      if (annotations.length === 0) {
        vscode.window.showInformationMessage(
          "No annotations available to read."
        );
        return;
      }
      for (const annotation of annotations) {
        const short = firstSentence(annotation.suggestion);
        const steps = toStepsFromSuggestion(annotation.suggestion);

        const spoken = formatHelpByGuidance({
          where: `Line ${annotation.line}`,
          summary: short,
          raw: annotation.suggestion,
          ruleHint: "",
          suggestions: steps
        });

        await speakMessage(spoken);
      }
    }
  );

  // Add all commands to context.subscriptions
  context.subscriptions.push(
    annotateCommand,
    speakNextAnnotationCommand,
    readAllAnnotationsCommand
  );
}

module.exports = {
  annotationQueue,
  parseChatResponse,
  applyDecoration,
  clearDecorations,
  getVisibleCodeWithLineNumbers,
  getEntireFileWithLineNumbers,
  registerAnnotationCommands,
  ANNOTATION_PROMPT,
};
