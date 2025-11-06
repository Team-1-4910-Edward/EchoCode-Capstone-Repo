import * as vscode from "vscode";
export function activate(context) {
    console.log("EchoCode: activate() starting. Env =", process.env.VSCODE_TEST);
    const isTest = process.env.VSCODE_TEST === "true";
    if (isTest) {
        console.log("EchoCode: test mode active. Skipping heavy startup like TTS and Copilot.");
    }
    else {
        console.log('EchoCode: normal mode activation.');
        // here you'd start TTS, Copilot, etc
    }
    // Always register commands (even in test mode)
    const disposable = vscode.commands.registerCommand("echolint.helloWorld", () => {
        const msg = isTest
            ? "[Test] Hello World simulated!"
            : "Hello World from EchoLint!";
        vscode.window.showInformationMessage(msg);
    });
    context.subscriptions.push(disposable);
}
export function deactivate() {
    console.log("EchoCode: extension deactivated.");
}
// Optional helper: visible code reader
function getVisibleCodeWithLineNumbers(textEditor) {
    let currentLine = textEditor.visibleRanges[0].start.line;
    const endLine = textEditor.visibleRanges[0].end.line;
    let code = "";
    while (currentLine < endLine) {
        code += `${currentLine + 1}: ${textEditor.document.lineAt(currentLine).text}\n`;
        currentLine++;
    }
    return code;
}
//# sourceMappingURL=extension.js.map