const {
  speakMessage,
} = require("../../program_settings/speech_settings/speechHandler");

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
    case "h":
      return `#include "${folderPath ? folderPath + "/" : ""}${fileName}"`;
    default:
      return `// Unsupported file type: ${extension}`;
  }
}

function areExtensionsCompatible(source, dest) {
  const sourceExt = source.split(".").pop().toLowerCase();
  const destExt = dest.split(".").pop().toLowerCase();

  if (sourceExt === destExt) return true;
  if (sourceExt === "h" && destExt === "cpp") return true;
  return false;
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
        await speakMessage(`Copied file path ${relativePath}`);
      }
    ),
    vscode.commands.registerCommand(
      "echocode.pasteImportAtCursor",
      async () => {
        if (!copiedFileName) {
          vscode.window.showWarningMessage("No file name copied.");
          return;
        }
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showWarningMessage("No active editor.");
          return;
        }
        const destinationFilePath = editor.document.fileName;
        const destinationFile = destinationFilePath.split(/[\\/]/).pop();
        const sourceFile = copiedFileName.split(/[\\/]/).pop();

        if (!areExtensionsCompatible(sourceFile, destinationFile)) {
          const errorMsg = `Cannot import ${sourceFile} into ${destinationFile}: incompatible file types.`;
          vscode.window.showWarningMessage(errorMsg);
          await speakMessage(errorMsg);
          return;
        }

        const importStatement = connectFile(copiedFileName);
        await editor.edit((editBuilder) => {
          editBuilder.insert(editor.selection.active, importStatement + "\n");
        });
        const message = `Copied ${sourceFile} to ${destinationFile}`;
        vscode.window.showInformationMessage(message);
        await speakMessage(message);
      }
    )
  );
}

module.exports = {
  connectFile,
  registerFileConnectorCommands,
};
