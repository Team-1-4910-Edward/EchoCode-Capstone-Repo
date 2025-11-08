const vscode = require("vscode");
const fs = require("fs");
const path = require("path");

const CACHE_FILE = path.join(__dirname, "voice_intent_cache.json");

// ✅ Load cache (local memory for learned commands)
let cache = {};
if (fs.existsSync(CACHE_FILE)) {
  try {
    cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  } catch {
    cache = {};
  }
}

/**
 * Smarter Copilot + cache–based intent classifier
 */
async function autoRouteVoiceIntent(transcript, VOICE_COMMANDS, outputChannel) {
  const clean = transcript.toLowerCase().trim();

  // 1️⃣ — Check cache first
  if (cache[clean]) {
    outputChannel.appendLine(`[VoiceIntent] Cached match: "${clean}" → ${cache[clean]}`);
    return cache[clean];
  }

  // 2️⃣ — Prepare compact Copilot prompt
  const commandsJson = VOICE_COMMANDS.map(c => ({
    id: c.id,
    title: c.title,
    description: c.description
  }));

  const systemPrompt = `
You are an intent classifier for the EchoCode VS Code extension.
Choose exactly one command ID from the list that matches the user's spoken phrase.
Use synonyms and paraphrases to infer meaning.
If nothing fits, return {"command":"none"}.

Example:
User: "make a new folder"
Output: {"command":"echocode.createFolder"}

Command list:
${JSON.stringify(commandsJson)}
`;

  try {
    const models = await vscode.lm.selectChatModels({ vendor: "copilot", family: "gpt-4o" });
    const model = models[0];
    if (!model) throw new Error("No Copilot model available");

    const messages = [
      vscode.LanguageModelChatMessage.System(systemPrompt),
      vscode.LanguageModelChatMessage.User(clean)
    ];

    const chatReq = await model.sendRequest(messages, { temperature: 0 });
    let text = "";
    for await (const frag of chatReq.text) text += frag;

    outputChannel.appendLine(`[VoiceIntent RAW] ${text}`);

    const match = text.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : {};
    const cmdId = parsed?.command || "none";

    // ✅ Cache successful match
    if (cmdId && cmdId !== "none") {
      cache[clean] = cmdId;
      fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
      outputChannel.appendLine(`[VoiceIntent] Classified "${clean}" → ${cmdId}`);
    } else {
      outputChannel.appendLine(`[VoiceIntent] No confident match for "${clean}".`);
    }

    return cmdId;
  } catch (err) {
    outputChannel.appendLine(`[VoiceIntent Error] ${err.message}`);
    return "none";
  }
}

module.exports = { autoRouteVoiceIntent };
