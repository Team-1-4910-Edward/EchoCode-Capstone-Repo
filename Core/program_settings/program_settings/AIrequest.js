const vscode = require('vscode'); // VSCode API

async function analyzeAI(code, instructionPrompt) {
    let chatRequest;
    const craftedPrompt = [
        vscode.LanguageModelChatMessage.User(instructionPrompt),
        vscode.LanguageModelChatMessage.User(code),
    ];

    try {
        // Prefer GPT-4o when available; otherwise fall back to any Copilot model
        const [preferred] = await vscode.lm.selectChatModels({
            vendor: "copilot",
            family: "gpt-4o",
        });
        let model = preferred;

        if (!model) {
            const [fallback] = await vscode.lm.selectChatModels({ vendor: "copilot" });
            model = fallback;
        }

        if (!model) {
            console.log("No Copilot Chat models available.");
            return "Error: GitHub Copilot Chat is not available. Please install/enable it and sign in.";
        }

        chatRequest = await model.sendRequest(craftedPrompt, {});
    } catch (err) {
        console.log("Error requesting from model", err);

        if (err instanceof vscode.LanguageModelError) {
            console.log(err.message, err.code, err.cause);
            return `Error: ${err.message}`;
        }

        return "Error: Unable to complete AI request.";
    }

    let results = "";
    for await (const fragment of chatRequest.text) {
        results += fragment;
    }

    return results;
}

module.exports = { analyzeAI };