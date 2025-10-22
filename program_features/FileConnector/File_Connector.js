const {
  speakMessage,
} = require("../../program_settings/speech_settings/speechHandler");
const path = require("path");
const vscode = require("vscode");

let copiedSymbol = null; // Will store { filePath, functionName, extension }

/**
 * Generates an absolute import statement for a Python function from the workspace root.
 */
function _generatePythonImport(sourcePath, functionName) {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(
    vscode.Uri.file(sourcePath)
  );
  if (!workspaceFolder) {
    // Cannot determine absolute path without a workspace
    return `_# Could not determine workspace root. Please add manually._\nfrom ${path.basename(
      sourcePath,
      ".py"
    )} import ${functionName}`;
  }

  const workspaceRoot = workspaceFolder.uri.fsPath;
  const relativePathFromRoot = path.relative(workspaceRoot, sourcePath);

  // Convert the file path to Python's dot-separated module path
  const modulePath = relativePathFromRoot
    .replace(/\.py$/, "")
    .replace(/[\\/]/g, ".");

  return `from ${modulePath} import ${functionName}`;
}

/**
 * Generates an import statement by dispatching to a language-specific function.
 */
function connectFunction(sourcePath, destPath, functionName, extension) {
  switch (extension) {
    case ".py":
      return _generatePythonImport(sourcePath, functionName);
    default:
      return `// Unsupported file type for function import: ${extension}`;
  }
}

/**
 * Finds the function symbol at the given cursor position.
 */
function findFunctionAtPosition(symbols, position) {
  for (const symbol of symbols) {
    if (symbol.range.contains(position)) {
      if (symbol.kind === vscode.SymbolKind.Function) {
        // Recurse to find the most specific nested function
        return findFunctionAtPosition(symbol.children, position) || symbol;
      }
      const childSymbol = findFunctionAtPosition(symbol.children, position);
      if (childSymbol) return childSymbol;
    }
  }
  return null;
}

function areExtensionsCompatible(source, dest) {
  const sourceExt = source.split(".").pop().toLowerCase();
  const destExt = dest.split(".").pop().toLowerCase();

  if (sourceExt === destExt) return true;
  return false;
}

function registerFileConnectorCommands(context, vscode) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "echocode.copyFileNameForImport", // This command now also handles exporting the function
      async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showWarningMessage("No active editor.");
          return;
        }

        const document = editor.document;
        const position = editor.selection.active;
        const symbols = await vscode.commands.executeCommand(
          "vscode.executeDocumentSymbolProvider",
          document.uri
        );

        if (!symbols || symbols.length === 0) {
          vscode.window.showWarningMessage("Could not analyze file structure.");
          return;
        }

        const funcSymbol = findFunctionAtPosition(symbols, position);

        if (funcSymbol) {
          copiedSymbol = {
            filePath: document.uri.fsPath,
            functionName: funcSymbol.name,
            extension: path.extname(document.uri.fsPath).toLowerCase(),
          };

          const message = `Copied and exported function "${
            funcSymbol.name
          }" from ${path.basename(document.uri.fsPath)}`;
          vscode.window.showInformationMessage(message);
          await speakMessage(message);
        } else {
          const message = "No function found at the current cursor position.";
          vscode.window.showWarningMessage(message);
          await speakMessage(message);
        }
      }
    ),
    vscode.commands.registerCommand(
      "echocode.pasteImportAtCursor", // This command now consolidates JS imports
      async () => {
        if (!copiedSymbol) {
          vscode.window.showWarningMessage("No function copied.");
          return;
        }
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showWarningMessage("No active editor.");
          return;
        }
        const document = editor.document;
        const destinationFilePath = document.uri.fsPath;
        const destinationFile = path.basename(destinationFilePath);
        const sourceFile = path.basename(copiedSymbol.filePath);

        if (!areExtensionsCompatible(sourceFile, destinationFile)) {
          const errorMsg = `Cannot import from ${sourceFile} into ${destinationFile}: incompatible file types.`;
          vscode.window.showWarningMessage(errorMsg);
          await speakMessage(errorMsg);
          return;
        }

        await editor.edit(async (editBuilder) => {
          // Default behavior for other languages or if no consolidation was possible
          const importStatement = connectFunction(
            copiedSymbol.filePath,
            destinationFilePath,
            copiedSymbol.functionName,
            copiedSymbol.extension
          );

          // Special handling for Python sys.path
          if (copiedSymbol.extension === ".py") {
            const fileContent = document.getText();
            const lines = fileContent.split("\n");
            const preambleLines = [
              "import sys",
              "import os",
              "sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))",
            ];

            // Find and delete any existing preamble lines to avoid duplication
            for (let i = 0; i < lines.length; i++) {
              const lineText = lines[i].trim();
              if (
                preambleLines.some((preambleLine) =>
                  lineText.includes(preambleLine.trim())
                )
              ) {
                const range = new vscode.Range(i, 0, i + 1, 0);
                editBuilder.delete(range);
              }
            }

            // Insert the full, correctly-ordered preamble at the top of the file
            const fullPreamble = preambleLines.join("\n") + "\n\n";
            editBuilder.insert(new vscode.Position(0, 0), fullPreamble);
          }

          // Insert the actual function import at the cursor
          editBuilder.insert(editor.selection.active, importStatement + "\n");
        });

        const message = `Imported function "${copiedSymbol.functionName}" into ${destinationFile}`;
        vscode.window.showInformationMessage(message);
        await speakMessage(message);
      }
    )
  );
}

module.exports = {
  registerFileConnectorCommands,
};
