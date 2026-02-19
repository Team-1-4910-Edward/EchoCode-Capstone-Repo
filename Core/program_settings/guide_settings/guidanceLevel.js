const vscode = require("vscode");

function getGuidanceLevel() {
  return vscode.workspace.getConfiguration("echocode").get("guidanceLevel", "balanced");
}

function normalize(text) {
  return (text ?? "").toString().replace(/\s+/g, " ").trim();
}

function firstSentence(text) {
  const t = normalize(text);
  if (!t) return "";
  const m = t.match(/^(.+?[.!?])(\s|$)/);
  return m ? m[1].trim() : t;
}

function trimForSpeech(text, maxChars) {
  const t = normalize(text);
  if (!t) return "";
  if (t.length <= maxChars) return t;

  const slice = t.slice(0, maxChars);
  const lastStop = Math.max(slice.lastIndexOf("."), slice.lastIndexOf("!"), slice.lastIndexOf("?"));
  if (lastStop > Math.floor(maxChars * 0.55)) return slice.slice(0, lastStop + 1).trim();

  return slice.trimEnd() + "...";
}

function formatHelpByGuidance({ where, summary, raw, ruleHint, suggestions = [] }) {
  const level = getGuidanceLevel();

  const W = where ? `${normalize(where)}.` : "";
  const S = normalize(summary);
  const R = normalize(raw);
  const H = normalize(ruleHint);
  const best = normalize(suggestions[0]);

  // If "summary" is empty, fall back safely
  const safeSummary = S || firstSentence(R) || "I found an issue here.";

  if (level === "guided") {
    // Friendly + short + actionable
    const core = trimForSpeech(safeSummary, 180);
    const fix = best ? `Try this: ${trimForSpeech(best, 160)}` : "";
    return [W, core, fix].filter(Boolean).join(" ");
  }

  if (level === "balanced") {
    // Location + short explanation + fix
    const core = trimForSpeech(safeSummary, 200);
    const hint = H ? trimForSpeech(H, 180) : "";
    const fix = best ? `Fix: ${trimForSpeech(best, 170)}` : "";
    return [W, core, hint, fix].filter(Boolean).join(" ");
  }

  // concise: location + high-signal snippet + (optional) fix
  // If raw is huge, take first sentence; if raw is too short/noisy, use summary.
  const rawCandidate = R && R.length >= 25 ? R : safeSummary;
  const core = trimForSpeech(firstSentence(rawCandidate), 220);
  const fix = best ? `Fix: ${trimForSpeech(best, 170)}` : "";

  // If we trimmed a lot, hint that more detail exists (optional)
  const trimmedNotice = normalize(rawCandidate).length > 220 ? "More details are in the output panel." : "";

  return [W, core, fix, trimmedNotice].filter(Boolean).join(" ");
}

module.exports = { getGuidanceLevel, formatHelpByGuidance };
