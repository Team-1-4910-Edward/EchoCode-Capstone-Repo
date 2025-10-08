let copiedFileName = null;

function connectFile(fileName) {
  const extension = fileName.split(".").pop().toLowerCase();
  switch (extension) {
    case "py":
      return `import ${fileName.replace(/\.py$/, "")}`;
    case "js":
      return `import ${fileName.replace(/\.js$/, "")} from './${fileName}';`;
    case "C++":
      return `#include "${fileName}"`;
    default:
        return `// Unsupported file type: ${extension}`;
  }
}

function registerFileConnectorCommands(context, vscode) {
  context.subscriptions.push(
    vscode.commands.registerCommand("echocode.copyFileNameForImport", async () => {
      const fileName = await vscode.window.showInputBox({
        prompt: "Enter the file name to import (e.g., utils.py)",
      });
      if (fileName) {
        copiedFileName = fileName;
        vscode.window.showInformationMessage(`Copied file name: ${fileName}`);
      }
    }),
    vscode.commands.registerCommand("echocode.pasteImportAtCursor", () => {
      if (!copiedFileName) {
        vscode.window.showWarningMessage("No file name copied.");
        return;
      }
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("No active editor.");
        return;
      }
      const importStatement = connectFile(copiedFileName);
      editor.edit(editBuilder => {
        editBuilder.insert(editor.selection.active, importStatement + "\n");
      });
      vscode.window.showInformationMessage("Import statement pasted.");
    })
  );
}

module.exports = {
  connectFile,
  registerFileConnectorCommands,
};
