// Language/registry.js
const { PythonAdapter } = require("./Python");
function pickAdapter(langId) {
  switch (langId) {
    case "python": return PythonAdapter;
    case "cpp": return null; // add later
    case "java": return null;
    case "csharp": return null;
    default: return null;
  }
}
module.exports = { pickAdapter };
