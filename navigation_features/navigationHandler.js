const vscode = require("vscode");
const {
  speakMessage,
} = require("../Core/program_settings/speech_settings/speechHandler");

let lastTimeout = null; // Stores the last scheduled speech event

function moveCursorToFunction(direction) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  const document = editor.document;
  const text = document.getText();
  const regex = /^(def |class )(\w+)/gm; // Matches Python functions & classes
  let positions = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
    positions.push({
      position: document.positionAt(match.index),
      name: match[2],
    });
  }

  if (positions.length === 0) {
    vscode.window.showInformationMessage("No functions or classes found.");
    return;
  }

  const currentPosition = editor.selection.active;
  let target = null;

  if (direction === "next") {
    for (let pos of positions) {
      if (pos.position.isAfter(currentPosition)) {
        target = pos;
        break;
      }
    }
  } else if (direction === "previous") {
    for (let i = positions.length - 1; i >= 0; i--) {
      if (positions[i].position.isBefore(currentPosition)) {
        target = positions[i];
        break;
      }
    }
  }

  if (target) {
    editor.selection = new vscode.Selection(target.position, target.position);
    editor.revealRange(new vscode.Range(target.position, target.position));

    // Cancel previous speech request if a new movement happens quickly
    if (lastTimeout) {
      clearTimeout(lastTimeout);
    }

    // Debounce: Speak after 500ms to prevent rapid speech overlap
    lastTimeout = setTimeout(() => {
      speakMessage(
        `Moved ${direction === "next" ? "next" : "previous"} to ${target.name}.`
      );
    }, 500);
  } else {
    vscode.window.showInformationMessage(
      `No more ${direction === "next" ? "next" : "previous"} functions.`
    );
  }
}

function registerMoveCursor(context) {
  const nextFunction = vscode.commands.registerCommand(
    "echocode.jumpToNextFunction",
    () => {
      moveCursorToFunction("next");
    }
  );

  const prevFunction = vscode.commands.registerCommand(
    "echocode.jumpToPreviousFunction",
    () => {
      moveCursorToFunction("previous");
    }
  );

  context.subscriptions.push(nextFunction, prevFunction);
}

module.exports = { registerMoveCursor };
