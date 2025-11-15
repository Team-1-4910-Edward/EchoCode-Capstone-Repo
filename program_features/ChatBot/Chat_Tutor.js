const vscode = require("vscode");
const {
  speakMessage,
} = require("../../Core/program_settings/speech_settings/speechHandler");

// Mock voice recognition for demo/development purposes
function performVoiceRecognition() {
  return new Promise((resolve) => {
    // Simulate voice recognition with a short delay
    setTimeout(() => {
      resolve("Can you explain this Python code?");
    }, 2000);
  });
}

const BASE_PROMPT = `You are a friendly and helpful coding tutor named EchoCode. Your goal is to help students learn programming in a conversational and encouraging way. When responding:

1. Use a friendly, conversational tone as if you're having a one-on-one chat
2. Be encouraging and supportive, even when pointing out areas for improvement
3. Break down complex concepts into simple, easy-to-understand explanations
4. Use analogies and examples to make technical concepts more relatable
5. Ask follow-up questions to check understanding
6. Be patient and willing to explain things multiple times if needed
7. Keep responses concise but warm and engaging
8. Use natural language - avoid sounding like a textbook
10. When giving feedback, use the "sandwich" method: start with something positive, then suggest improvements, and end with encouragement

Remember to:
- Keep responses at a MAXIMUM of 4 sentences as concise as reasonable
- Format responses for text-to-speech (avoid markdown and code blocks)
- Focus on the specific file the user is working on
- Politely decline non-programming or non-Python questions
- Guide users to solve problems themselves rather than giving complete solutions

Below is the content of the active file. Here is the file content:\n\n`;

// Custom WebViewProvider for the chat view
class EchoCodeChatViewProvider {
  constructor(context, outputChannel) {
    this.context = context;
    this.outputChannel = outputChannel;
    this._view = null;
    this.conversationHistory = [];
    this._isListening = false;

    this._currentWebview = null;
  }

  resolveWebviewView(webviewView, context, token) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };

    this._currentWebview = webviewView.webview;
    webviewView.onDidDispose(() => {
      this._currentWebview = null;
    });

    // Set the initial HTML content
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(
      async (message) => {
        this.outputChannel.appendLine(`Received message from webview: ${message.type}`);
        if (message.type === "userInput") {
          await this.handleUserMessage(message.text);
        } 
        else if (message.type === "executeVoiceCommand") {
          const transcript = message.text || "";
          const { tryExecuteVoiceCommand } = require("../../extension");
          const outputChannel = this.outputChannel;
          const result = await tryExecuteVoiceCommand(transcript, outputChannel);
          if (result.handled) {
            this._currentWebview.postMessage({
              type: "response",
              text: `✅ Executed command: ${result.command}`
            });
          }
          else {
            await this.handleUserMessage(transcript);
          }
        }
        else if (message.type === "startVoiceInput") {
          await vscode.commands.executeCommand("echocode._voiceStart");
        } 
        else if (message.type === "stopVoiceInput") {
          if (this._currentWebview) {
            this._currentWebview.postMessage({ type: "voiceStopping" });
          }
          const result = await vscode.commands.executeCommand("echocode._voiceStop");
          if (this._currentWebview) {
            if (result && result.ok) {
              this._currentWebview.postMessage({ type: "voiceRecognitionResult", text: result.text || "" });

              // Try to execute a voice-mapped command before Copilot ===
              const { tryExecuteVoiceCommand } = require("../../extension");
              const outputChannel = this.outputChannel;
              const voiceResult = await tryExecuteVoiceCommand(transcript, outputChannel);

              if (voiceResult.handled) {
                // Voice command recognized and executed — stop here
                this._currentWebview.postMessage({
                  type: "response",
                  text: `Executed command: ${voiceResult.command}`
                });
                return; // do NOT fall through to Copilot
              }

              // else: fall through to normal Copilot behavior
              await this.handleUserMessage(result.text || "");

            } else {
              this._currentWebview.postMessage({
                type: "voiceRecognitionError",
                error: result?.error || "Unknown error",
              });
            }
          }
        }
      },
      undefined,
      this.context.subscriptions
    );
  }

  async startVoiceRecognition() {
    if (this._isListening || !this._view) return;

    this._isListening = true;
    this.outputChannel.appendLine("Starting voice recognition");

    // Signal the webview that we're listening
    this._view.webview.postMessage({ type: "voiceListeningStarted" });

    try {
      const recognizedText = await performVoiceRecognition();

      if (recognizedText && this._view) {
        // Send the recognized text to the webview to display in the input field
        this._view.webview.postMessage({
          type: "voiceRecognitionResult",
          text: recognizedText,
        });
      }
    } catch (error) {
      this.outputChannel.appendLine(
        `Voice recognition error: ${error.message}`
      );
      if (this._view) {
        this._view.webview.postMessage({
          type: "voiceRecognitionError",
          error: error.message,
        });
      }
    } finally {
      this._isListening = false;
      if (this._view) {
        this._view.webview.postMessage({ type: "voiceListeningStopped" });
      }
    }
  }

  async handleUserMessage(userInput) {
    if (!this._view) return;
    let prompt = BASE_PROMPT;

    // Try to get an active Python editor
    let editor = vscode.window.activeTextEditor;
    if (
      !editor ||
      !editor.document ||
      editor.document.languageId !== "python"
    ) {
      const visibleEditors = vscode.window.visibleTextEditors;
      editor = visibleEditors.find(
        (ed) => ed.document && ed.document.languageId === "python"
      );
      this.outputChannel.appendLine(
        editor
          ? "Found a visible Python editor: " + editor.document.fileName
          : "No active or visible Python editor found."
      );
    } else {
      this.outputChannel.appendLine(
        "Active editor: " + editor.document.fileName
      );
    }

    let fileContent = "";
    if (editor && editor.document) {
      fileContent = editor.document.getText();
      this.outputChannel.appendLine("Active file content retrieved for chat");
    } else {
      this._view.webview.postMessage({
        type: "response",
        text: "No active Python file is open. Please open a Python file to get help with its code.",
      });
      this.outputChannel.appendLine("No active Python file found for chat");
      return;
    }

    prompt +=
      fileContent +
      "\n\nNow, please answer the user's question or provide an exercise based on this code.";

    const messages = [vscode.LanguageModelChatMessage.User(prompt)];

    this.conversationHistory.forEach((entry) => {
      messages.push(vscode.LanguageModelChatMessage.User(entry.user));
      messages.push(vscode.LanguageModelChatMessage.Assistant(entry.response));
    });

    messages.push(vscode.LanguageModelChatMessage.User(userInput));

    const [model] = await vscode.lm.selectChatModels({
      vendor: "copilot",
      family: "gpt-4o",
    });

    if (!model) {
      this._view.webview.postMessage({
        type: "response",
        text: "No language model available. Please ensure GitHub Copilot is enabled.",
      });
      this.outputChannel.appendLine("No language model available for chat");
      return;
    }

    // Show loading indicator
    this._view.webview.postMessage({ type: "responseLoading", started: true });

    try {
      const chatResponse = await model.sendRequest(
        messages,
        {},
        new vscode.CancellationTokenSource().token
      );
      let responseText = "";

      // Create a cancellation token source for speech
      const speechCancellationToken = new vscode.CancellationTokenSource();

      for await (const fragment of chatResponse.text) {
        responseText += fragment;
        // Send incremental updates to the webview
        this._view.webview.postMessage({
          type: "responseFragment",
          text: fragment,
        });
      }

      this.conversationHistory.push({
        user: userInput,
        response: responseText,
      });
      this._view.webview.postMessage({
        type: "responseComplete",
        text: responseText,
      });
      this.outputChannel.appendLine("Chat response: " + responseText);

      // Speak the chat response aloud using speechHandler
      // Check if speech hasn't been cancelled
      if (!speechCancellationToken.token.isCancellationRequested) {
        await speakMessage(responseText);
      }
    } catch (error) {
      this.outputChannel.appendLine(`Error getting response: ${error.message}`);
      this._view.webview.postMessage({
        type: "responseError",
        error: `Error: ${error.message}`,
      });
    } finally {
      this._view.webview.postMessage({
        type: "responseLoading",
        started: false,
      });
    }
  }

  startVoiceInput() {
    if (this._view && this._currentWebview) {
      this._currentWebview.postMessage({ type: "startVoiceInput" });
    } else {
      vscode.window.showInformationMessage("Please open the EchoCode Tutor view to use voice input.");
      this.outputChannel.appendLine("Voice input command invoked with no active chat view.");
    }
  }

  _getHtmlForWebview(webview) {
    // Create URI for styles and scripts
    const styleMainUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "chat.css")
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "chat.js")
    );

    // Generate a nonce to use for inline script
    const nonce = getNonce();

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https:;">
        <link href="${styleMainUri}" rel="stylesheet">
        <title>EchoCode Tutor</title>
    </head>
    <body>
        <div id="chat-container">
            <div id="messages-container"></div>
            <div id="input-container">
                <textarea id="user-input" placeholder="Ask a question about your code..."></textarea>
                <div id="button-container">
                    <button id="send-button" title="Send message" class="icon-button">
                        <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                            <path d="M8.08073 5.36896L11.8807 4.06896L10.5807 7.86896L8.08073 5.36896ZM13.1399 2.81L3.1399 7.81C2.9899 7.88 2.9099 8.05 2.9399 8.21C2.9699 8.38 3.0999 8.5 3.2699 8.5H7.9999V13.24C7.9999 13.4 8.1299 13.54 8.2999 13.56C8.3099 13.56 8.3199 13.56 8.3299 13.56C8.4799 13.56 8.6199 13.48 8.6899 13.35L13.6899 3.35C13.7599 3.19 13.7399 3 13.6399 2.87C13.5399 2.74 13.3499 2.69 13.1799 2.76L13.1399 2.81Z"/>
                        </svg>
                    </button>
                    <button id="voice-button" title="Start voice input" class="icon-button">
                        <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                            <path d="M8 10.9844C9.46875 10.9844 10.4844 9.95312 10.4844 8V3C10.4844 1.04688 9.45312 0 8 0C6.53125 0 5.51562 1.04688 5.51562 3V8C5.51562 9.95312 6.53125 10.9844 8 10.9844ZM4 5.51562V8C4 10.7344 5.71875 12.4844 8.25 12.4844C10.7812 12.4844 12.5 10.7344 12.5 8V5.51562H14V8C14 11.4062 11.7812 13.5156 9 13.9375V16H7V13.9375C4.21875 13.5156 2 11.4062 2 8V5.51562H4Z"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div id="status-container">
                <div id="listening-indicator" class="status-indicator hidden">
                    Listening...
                </div>
                <div id="loading-indicator" class="status-indicator hidden">
                    Thinking...
                </div>
            </div>
        </div>
        <script nonce="${nonce}" src="${scriptUri}"></script>
    </body>
    </html>`;
  }
}

function getNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function registerChatCommands(context, outputChannel) {
  // Create the chat view provider
  const chatViewProvider = new EchoCodeChatViewProvider(context, outputChannel);

  // Register the chat view provider
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "echocode.chatView",
      chatViewProvider
    )
  );

  // Register the command to open the chat panel
  const openChatDisposable = vscode.commands.registerCommand(
    "echocode.openChat",
    async () => {
      outputChannel.appendLine("echocode.openChat command triggered");
      await vscode.commands.executeCommand("echocode.chatView.focus");
    }
  );

  // Register a new command to start voice input
  const startVoiceInputDisposable = vscode.commands.registerCommand(
    "echocode.startVoiceInput",
    () => {
      if (chatViewProvider) {
        chatViewProvider.startVoiceInput();
      } else {
        vscode.window.showInformationMessage(
          "Please open the EchoCode Tutor view to use voice input."
        );
        outputChannel.appendLine(
          "Voice input command invoked with no active chat view."
        );
      }
    }
  );

  // Add commands to subscriptions
  context.subscriptions.push(openChatDisposable, startVoiceInputDisposable);

  // Return the chatViewProvider so extension.js can access it if needed
  return chatViewProvider;
}

module.exports = {
  registerChatCommands,
  EchoCodeChatViewProvider,
};
