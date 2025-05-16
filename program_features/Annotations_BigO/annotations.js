const vscode = require("vscode");
const Queue = require("./queue_system");

let activeDecorations = [];
const annotationQueue = new Queue();
let annotationsVisible = false;
const ANNOTATION_PROMPT = `You are an EchoCode tutor who helps students learn how to write better code. Your job is to evaluate a block of code that the user gives you. You will then annotate any lines that could be improved with a brief suggestion and the reason why you are making that suggestion. Only make suggestions when you feel the severity is enough that it will impact the readability and maintainability of the code. Be friendly with your suggestions and remember that these are students so they need gentle guidance. Format each suggestion as a single JSON object. It is not necessary to wrap your response in triple backticks. Here is an example of what your response should look like:

{ "line": 1, "suggestion": "I think you should use a for loop instead of a while loop. A for loop is more concise and easier to read." }{ "line": 12, "suggestion": "I think you should use a for loop instead of a while loop. A for loop is more concise and easier to read." }
`;

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

function registerAnnotationCommands(context) {
  const annotateCommand = vscode.commands.registerTextEditorCommand(
    "echocode.annotate",
    async (textEditor) => {
      if (annotationsVisible) {
        clearDecorations();
        annotationQueue.clear();
        annotationsVisible = false;
        vscode.window.showInformationMessage("Annotations cleared");
        return;
      }

      try {
        const codeWithLineNumbers = getVisibleCodeWithLineNumbers(textEditor);
        const [model] = await vscode.lm.selectChatModels({
          vendor: "copilot",
          family: "gpt-4o",
        });
        if (!model) {
          vscode.window.showErrorMessage(
            "No language model available. Please ensure Copilot is enabled."
          );
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
      } catch (error) {
        vscode.window.showErrorMessage(
          "Failed to annotate code: " + error.message
        );
      }
    }
  );

  context.subscriptions.push(annotateCommand);
}

module.exports = {
  annotationQueue, // Export the queue
  parseChatResponse,
  applyDecoration,
  clearDecorations,
  getVisibleCodeWithLineNumbers,
  registerAnnotationCommands,
  ANNOTATION_PROMPT  // Add this export
};
