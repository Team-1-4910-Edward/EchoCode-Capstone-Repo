const vscode = require("vscode");

// Helper to get model safely
async function selectModel() {
  // 1. Get all copilot models
  const models = await vscode.lm.selectChatModels({ vendor: "copilot" });

  // 2. Safety check
  if (!models || models.length === 0) {
    throw new Error(
      "No Copilot models available. Please check your GitHub Copilot Chat extension."
    );
  }

  // 3. Prefer GPT-4, fallback to default
  let selected = models.find((m) => m.family && m.family.includes("gpt-4"));
  if (!selected) {
    selected = models[0];
  }
  return selected;
}

async function analyzeAI(code, instructionPrompt) {
  try {
    const model = await selectModel();
    const combinedPrompt = `${instructionPrompt}\n\nCode to analyze:\n${code}`;
    const messages = [vscode.LanguageModelChatMessage.User(combinedPrompt)];

    const chatRequest = await model.sendRequest(messages, {});

    let results = "";
    for await (const fragment of chatRequest.text) {
      results += fragment;
    }
    return results;
  } catch (err) {
    // Handle off-topic refusals cleanly
    if (err.message && err.message.includes("off_topic")) {
      return "I cannot analyze this code (Copilot refusal).";
    }
    throw err;
  }
}

async function classifyVoiceIntent(transcript, commands, opts = {}) {
  try {
    const temperature = opts.temperature ?? 0.0;
    const model = await selectModel();

    // System prompt engineered as User message
    const systemInstruction =
      'Output only JSON like {"command": "<id>"}. Reply ONLY with strict minified JSON.';

    const combinedPrompt = `SYSTEM:\n${systemInstruction}\n\nUSER DATA:\n${JSON.stringify(
      { transcript, commands: commands.map((c) => ({ id: c.id })) }
    )}`;

    const messages = [vscode.LanguageModelChatMessage.User(combinedPrompt)];
    const chatReq = await model.sendRequest(messages, { temperature });

    let text = "";
    for await (const frag of chatReq.text) text += frag;

    const match = text.match(/\{[\s\S]*\}/);
    const candidate = match ? match[0] : text;
    try {
      const parsed = JSON.parse(candidate);
      return parsed.command || "none";
    } catch {
      return "none";
    }
  } catch (err) {
    return "none";
  }
}

async function generateCodeFromVoice(transcript, languageId, indentation = "") {
  try {
    const model = await selectModel();

    const combinedPrompt = `SYSTEM: You are an expert coding assistant. Convert request to valid ${languageId} code. 
    - Return ONLY the code. 
    - No markdown blocks. 
    - No conversational text or explanations.
    \nUSER REQUEST: ${transcript}`;

    const messages = [vscode.LanguageModelChatMessage.User(combinedPrompt)];

    const chatReq = await model.sendRequest(messages, { temperature: 0.1 });

    let code = "";
    for await (const fragment of chatReq.text) {
      code += fragment;
    }

    // Cleanup any leaked markdown formatting
    return code
      .replace(/^```[a-z]*\n/i, "")
      .replace(/```$/, "")
      .trim();
  } catch (err) {
    throw new Error(`Copilot Error: ${err.message}`);
  }
}

module.exports = {
  analyzeAI,
  classifyVoiceIntent,
  generateCodeFromVoice,
};
