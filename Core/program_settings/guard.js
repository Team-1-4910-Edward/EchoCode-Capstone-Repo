const { getMode } = require("./mode");
const { speakMessage } = require("./speech_settings/speechHandler");

// Commands that are DISABLED in Student Mode
const STUDENT_LOCKED_COMMANDS = new Set([
  "echocode.openChat",
  "echocode.startVoiceInput",
  "echocode.voiceInput",

  "echocode.summarizeClass",
  "echocode.summarizeFunction",
  "echocode.summarizeProgram",

  "echocode.annotate",
  "echocode.speakNextAnnotation",
  "echocode.readAllAnnotations",
  "code-tutor.Annotate",
  "code-tutor.speakNextAnnotation",
  "code-tutor.readAllAnnotation",

  "code-tutor.analyzeBigO",
  "code-tutor.iterateBigOQueue",
  "code-tutor.readEntireBigOQueue",

  "echocode.describeCurrentLine",

  "echocode.copyFileNameForImport",
  "echocode.pasteImportAtCursor",

  "echocode.compileAndParseCpp",
  "echocode.checkPythonErrors"
]);

function isAllowed(commandId) {
  if (getMode() === "dev") return true;
  return !STUDENT_LOCKED_COMMANDS.has(commandId);
}

function guard(commandId, handler) {
  return async (...args) => {
    if (!isAllowed(commandId)) {
      await speakMessage("Error. This feature is currently locked.");
      return;
    }
    return handler(...args);
  };
}

module.exports = {
  STUDENT_LOCKED_COMMANDS,
  isAllowed,
  guard
};
