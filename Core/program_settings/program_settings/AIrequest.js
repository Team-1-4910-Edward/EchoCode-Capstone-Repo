const vscode = require('vscode'); // VSCode API

async function analyzeAI (code, instructionPrompt) {
    var chatRequest;
    const craftedPrompt = [
        vscode.LanguageModelChatMessage.User(
        // Default prompt
        // 'Give a brief explanation of the flow of execution of the provided python function'
            instructionPrompt
        ),
        vscode.LanguageModelChatMessage.User(code)
    ];
    const models = await vscode.lm.selectChatModels({
        vendor: 'copilot'
    });
    if(models.length === 0){
        console.log("There are no models available");
    }

    try {
        const [model] = await vscode.lm.selectChatModels({ vendor: 'copilot', family: 'gpt-4o' });
        chatRequest = await model.sendRequest(craftedPrompt, {});
    } catch (err) {
        console.log("error with requesting from model");
        // Making the chat request might fail because
        // - model does not exist
        // - user consent not given
        // - quota limits w ere exceeded
        if (err instanceof vscode.LanguageModelError) {
        console.log(err.message, err.code, err.cause);
        if (err.cause instanceof Error && err.cause.message.includes('off_topic')) {
            stream.markdown(
            vscode.l10n.t("I'm sorry, I cannot summarize the provided code.")
            );
        }
        } else {
        // add other error handling logic
            throw err;
        }
    }

    var results = '';
    for await (const fragment of chatRequest.text) {
        results += fragment;
    }
    
    return results;
}

module.exports = { analyzeAI };

async function classifyVoiceIntent(transcript, commands, opts = {}) {
  const temperature = opts.temperature ?? 0.0;

  // 1) Pick a Copilot chat model
  const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
  if (!models || models.length === 0) {
    // Surface a clear error if no model
    throw new Error('No Copilot chat models available. Please enable GitHub Copilot Chat.');
  }
  const model = models[0];

  // 2) System + user messages
  const systemPrompt =
    "You are a command router. Match the user's spoken intent to the closest command ID from this list. \
    Output only JSON like {\"command\": \"<id>\"}. \
    Do not explain. If the phrase 'create new folder' appears, match to echocode.createFolder. \
    If 'make folder', 'new folder', or 'create folder' appears, match the same." +
    "Reply ONLY with strict minified JSON: {\"command\":\"<id-or-none>\"}. " +
    "If the user intent is unclear, return {\"command\":\"none\"}. No extra text.";

  const userPayload = {
    transcript,
    // Keep this compact to reduce latency
    commands: commands.map(c => ({
      id: c.id,
      title: c.title || "",
      description: c.description || ""
    }))
  };

  const messages = [
    vscode.LanguageModelChatMessage.System(systemPrompt),
    vscode.LanguageModelChatMessage.User(JSON.stringify(userPayload)),
  ];

  // 3) Send request
  let chatReq;
  try {
    chatReq = await model.sendRequest(messages, { temperature });
  } catch (err) {
    if (err instanceof vscode.LanguageModelError) {
      throw new Error(`LLM error: ${err.message}`);
    }
    throw err;
  }

  // 4) Stream text → finalize into a string
  let text = '';
  for await (const frag of chatReq.text) text += frag;

  // 5) Parse strict JSON; be forgiving if model wrapped it
  const match = text.match(/\{[\s\S]*\}/);
  const candidate = match ? match[0] : text;
  try {
    const parsed = JSON.parse(candidate);
    const cmd = typeof parsed?.command === 'string' ? parsed.command : 'none';
    return cmd;
  } catch {
    return "none";
  }
}

module.exports.classifyVoiceIntent = classifyVoiceIntent;