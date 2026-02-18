const vscode = require("vscode");

/// Retrieves the current guidance level from the extension's configuration.
function getGuidanceLevel() {
  return vscode.workspace.getConfiguration("echocode").get("guidanceLevel", "balanced");
}

/// Formats help messages based on the current guidance level.
function formatHelpByGuidance({ where, summary, raw, ruleHint, suggestions = [] }) {
  const level = getGuidanceLevel();
  const best = suggestions[0];

  // Guided: Focus on clarity and step-by-step guidance, minimal jargon.
  if (level === "guided") {
    return [where ? `${where}.` : "", summary, best ? `Try this: ${best}` : ""]
      .filter(Boolean)
      .join(" ");
  }

  // Balanced: A mix of clarity and technical detail, includes rule hints and a fix suggestion.
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
