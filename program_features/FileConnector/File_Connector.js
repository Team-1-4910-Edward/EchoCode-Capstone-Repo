let copiedFileName = null;

function connectFile(filePath) {
  const parts = filePath.split(/[\\/]/);
  const fileName = parts.pop();
  const folderPath = parts.join("/");
  const extension = fileName.split(".").pop().toLowerCase();

  switch (extension) {
    case "py":
      return folderPath
        ? `from ${folderPath.replace(/\//g, ".")} import ${fileName.replace(
            /\.py$/,
            ""
          )}`
        : `import ${fileName.replace(/\.py$/, "")}`;
    case "js":
      return `import ${fileName.replace(/\.js$/, "")} from './${
        folderPath ? folderPath + "/" : ""
      }${fileName}';`;
    case "cpp":
      return `#include "${folderPath ? folderPath + "/" : ""}${fileName}"`;
    default:
      return `// Unsupported file type: ${extension}`;
  }
}

function registerFileConnectorCommands(context, vscode) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "echocode.copyFileNameForImport",
      async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showWarningMessage("No active editor.");
          return;
        }
        const filePath = editor.document.fileName;
        // Normalize to workspace-relative path
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(
          editor.document.uri
        );
        let relativePath = filePath;
        if (workspaceFolder) {
          relativePath = vscode.workspace.asRelativePath(filePath, false);
        }
        copiedFileName = relativePath;
        vscode.window.showInformationMessage(
          `Copied file path: ${relativePath}`
        );
      }
    ),
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
      editor.edit((editBuilder) => {
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
