const vscode = require("vscode");

function getGuidanceLevel() {
  return vscode.workspace.getConfiguration("echocode").get("guidanceLevel", "balanced");
}

function formatHelpByGuidance({ where, summary, raw, ruleHint, suggestions = [] }) {
  const level = getGuidanceLevel();
  const best = suggestions[0];

  if (level === "guided") {
    return [where ? `${where}.` : "", summary, best ? `Try this: ${best}` : ""]
      .filter(Boolean)
      .join(" ");
  }

  if (level === "balanced") {
    return [
      where ? `${where}.` : "",
      summary,
      ruleHint || "",
      best ? `Fix: ${best}` : ""
    ]
      .filter(Boolean)
      .join(" ");
  }

  // concise
  return [where ? `${where}.` : "", raw || summary, best ? `Fix: ${best}` : ""]
    .filter(Boolean)
    .join(" ");
}


module.exports = { getGuidanceLevel, formatHelpByGuidance };
