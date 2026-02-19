// program_features/Annotations_BigO/annotations.js
const vscode = require("vscode");
const Queue = require("./queue_system");
const {
  speakMessage,
} = require("../../Core/program_settings/speech_settings/speechHandler");

const {
  formatHelpByGuidance,
} = require("../../Core/program_settings/guide_settings/guidanceLevel");

let activeDecorations = [];
const annotationQueue = new Queue();
let annotationsVisible = false;

// -------------------------
// Guidance-aware prompt
// -------------------------
function getGuidanceLevel() {
  return vscode.workspace.getConfiguration("echocode").get("guidanceLevel", "balanced");
}

function buildAnnotationPrompt() {
  const level = getGuidanceLevel();

  const modeBlock =
    level === "guided"
      ? `GUIDED MODE:
- Use simple language (no jargon).
- Provide "summary" as 1 sentence.
- Provide exactly 2 short, actionable steps in "steps".
- Leave "why" empty OR keep it extremely short (optional).`
      : level === "balanced"
      ? `BALANCED MODE:
- Provide "summary" as 1 sentence.
- Provide "why" as 1 short sentence (reason).
- Provide exactly 1 step in "steps".`
      : `CONCISE MODE:
- Provide ONLY "summary" as 1 sentence.
- Set "why" to an empty string.
- Set "steps" to an empty array.`;

  return `You are an EchoCode tutor. Review the code and suggest improvements ONLY when severity impacts readability or maintainability.

${modeBlock}

Return annotations as JSON objects ONLY (no backticks, no extra text).
Each object MUST match exactly this schema:
{ "line": <number>, "summary": <string>, "why": <string>, "steps": <string[]> }

Return multiple objects back-to-back like:
{ "line": 1, "summary": "...", "why": "...", "steps": ["...","..."] }{ "line": 12, "summary": "...", "why": "...", "steps": ["..."] }

Do not wrap in an array. Do not include any other text.`;
}

// -------------------------
// Helpers
// -------------------------
function getEntireFileWithLineNumbers(textEditor) {
  const documentLineCount = textEditor.document.lineCount;
  let code = "";
  for (let lineNumber = 0; lineNumber < documentLineCount; lineNumber++) {
    code += `${lineNumber + 1}: ${textEditor.document.lineAt(lineNumber).text}\n`;
  }
  return code;
}

// Robust streamed JSON object extractor (handles arrays in "steps")
function extractJsonObjectsFromStream(streamText) {
  const objs = [];
  let inString = false;
  let escape = false;
  let depth = 0;
  let start = -1;

  for (let i = 0; i < streamText.length; i++) {
    const ch = streamText[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === "\\") {
      if (inString) escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
      continue;
    }

    if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        const chunk = streamText.slice(start, i + 1);
        objs.push(chunk);
        start = -1;
      }
    }
  }

  // Return found objects + leftover tail (for next fragments)
  const lastCompleteEnd =
    objs.length > 0 ? streamText.lastIndexOf(objs[objs.length - 1]) + objs[objs.length - 1].length : 0;

  return {
    objects: objs,
    leftover: lastCompleteEnd > 0 ? streamText.slice(lastCompleteEnd) : streamText,
  };
}

function applyDecoration(editor, line, suggestionText) {
  const decorationType = vscode.window.createTextEditorDecorationType({
    after: {
      contentText: ` ${String(suggestionText).substring(0, 25) + "..."}`,
      color: "grey",
    },
  });

  const lineLength = editor.document.lineAt(line - 1).text.length;
  const range = new vscode.Range(
    new vscode.Position(line - 1, lineLength),
    new vscode.Position(line - 1, lineLength)
  );

  editor.setDecorations(decorationType, [{ range, hoverMessage: suggestionText }]);

  activeDecorations.push({ decorationType, editor });
}

function clearDecorations() {
  for (const decoration of activeDecorations) {
    decoration.editor.setDecorations(decoration.decorationType, []);
  }
  activeDecorations = [];
}

// -------------------------
// Parse Copilot response
// -------------------------
async function parseChatResponse(chatResponse, textEditor) {
  let buffer = "";

  for await (const fragment of chatResponse.text) {
    buffer += fragment;

    const { objects, leftover } = extractJsonObjectsFromStream(buffer);

    for (const objText of objects) {
      try {
        const annotation = JSON.parse(objText);

        // Backwards compatibility if Copilot returns old schema
        const line = annotation.line;
        const summary = annotation.summary || annotation.suggestion || "";
        const why = annotation.why || "";
        const steps = Array.isArray(annotation.steps) ? annotation.steps : [];

        if (typeof line !== "number" || !summary) continue;

        applyDecoration(textEditor, line, summary);

        annotationQueue.enqueue({
          line,
          summary,
          why,
          steps,
          // keep old field in case other code references it
          suggestion: annotation.suggestion || summary,
        });

        console.log(`[EchoCode] Annotation queued: line ${line}`);
      } catch (e) {
        console.error("[EchoCode] Failed to parse annotation JSON:", e.message);
      }
    }

    buffer = leftover;
  }

  console.log("[EchoCode] Current annotation queue:", annotationQueue.items);
}

// -------------------------
// Commands
// -------------------------
function registerAnnotationCommands(context, outputChannel) {
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
        const codeWithLineNumbers = getEntireFileWithLineNumbers(textEditor);

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
          new vscode.LanguageModelChatMessage(0, buildAnnotationPrompt()),
          new vscode.LanguageModelChatMessage(0, codeWithLineNumbers),
        ];

        const chatResponse = await model.sendRequest(
          messages,
          {},
          new vscode.CancellationTokenSource().token
        );

        await parseChatResponse(chatResponse, textEditor);
        annotationsVisible = true;

        statusBarMessage.dispose();
        vscode.window.setStatusBarMessage("EchoCode finished analyzing your code", 3000);
        outputChannel.appendLine("Annotations applied successfully");
      } catch (error) {
        outputChannel.appendLine("Error in annotate command: " + error.message);
        vscode.window.showErrorMessage("Failed to annotate code: " + error.message);
      }
    }
  );

  const speakNextAnnotationCommand = vscode.commands.registerCommand(
    "echocode.speakNextAnnotation",
    async () => {
      outputChannel.appendLine("echocode.speakNextAnnotation command triggered");

      if (!annotationQueue.isEmpty()) {
        const next = annotationQueue.dequeue();

        // Use structured content; modes now truly differ because Copilot changes output by level
        const spoken = formatHelpByGuidance({
          where: `Line ${next.line}`,
          summary: next.summary || next.suggestion,
          raw: next.summary || next.suggestion,
          ruleHint: next.why || "",
          suggestions: next.steps || [],
        });

        vscode.window.showInformationMessage(`Annotation ready (line ${next.line})`);
        await speakMessage(spoken);
      } else {
        vscode.window.showInformationMessage("No more annotations to read.");
        await speakMessage("No more annotations to read.");
      }
    }
  );

  const readAllAnnotationsCommand = vscode.commands.registerCommand(
    "echocode.readAllAnnotations",
    async () => {
      outputChannel.appendLine("Reading all annotations aloud...");

      const annotations = annotationQueue.items;
      if (annotations.length === 0) {
        vscode.window.showInformationMessage("No annotations available to read.");
        return;
      }

      for (const a of annotations) {
        const spoken = formatHelpByGuidance({
          where: `Line ${a.line}`,
          summary: a.summary || a.suggestion,
          raw: a.summary || a.suggestion,
          ruleHint: a.why || "",
          suggestions: a.steps || [],
        });

        await speakMessage(spoken);
      }
    }
  );

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
  getEntireFileWithLineNumbers,
  registerAnnotationCommands,
};
