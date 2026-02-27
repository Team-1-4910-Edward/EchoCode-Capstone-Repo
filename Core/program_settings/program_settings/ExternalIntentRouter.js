const fs = require("fs");
const path = require("path");

const commandsPath = path.join(__dirname, "external_commands.json");

// Cache commands in memory — only reload if file changes
let cachedCommands = null;
let watcher = null;

function getCommands() {
  if (cachedCommands) return cachedCommands;
  try {
    cachedCommands = JSON.parse(fs.readFileSync(commandsPath, "utf-8"));
    // Watch for changes so user edits are picked up without restart
    if (!watcher) {
      watcher = fs.watch(commandsPath, () => {
        cachedCommands = null; // Invalidate cache on file change
      });
    }
  } catch {
    cachedCommands = [];
  }
  return cachedCommands;
}

/**
 * Returns matched external command object or null.
 * @param {string} transcript - Lowercased, trimmed transcript
 */
function matchExternalCommand(transcript) {
  for (const cmd of getCommands()) {
    if (
      cmd.keywords &&
      cmd.keywords.some((k) => transcript.includes(k.toLowerCase()))
    ) {
      return cmd;
    }
  }
  return null;
}

module.exports = { matchExternalCommand };
