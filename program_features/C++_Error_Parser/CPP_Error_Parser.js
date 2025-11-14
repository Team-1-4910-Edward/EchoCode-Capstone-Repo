const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");
const {
  speakMessage,
} = require("../../Core/program_settings/speech_settings/speechHandler");

// Function to parse terminal output for C++ compilation errors
function parseCppCompilationErrors(terminalOutput) {
  const errorPatterns = [
    {
      regex: /error: expected '.*' before '.*'/,
      explanation:
        "This error usually occurs when there is a missing semicolon, bracket, or syntax issue before the specified token.",
      fix: "Check the line mentioned in the error message and ensure all syntax is correct, including semicolons and brackets.",
    },
    {
      regex: /undefined reference to '(.*)'/,
      explanation:
        "This error indicates that the linker cannot find the definition of a function or variable.",
      fix: "Ensure that the function or variable is defined and that the appropriate library or object file is linked during compilation.",
    },
    {
      regex: /no matching function for call to '(.*)'/,
      explanation:
        "This error occurs when the function call does not match any available function signature.",
      fix: "Check the function call and ensure the arguments match the expected types and order.",
    },
    {
      regex: /'(.*)' was not declared in this scope/,
      explanation:
        "This error means that the variable or function has not been declared in the current scope.",
      fix: "Ensure that the variable or function is declared before use and that the necessary headers are included.",
    },
    {
      regex: /multiple definition of '(.*)'/,
      explanation:
        "This error occurs when the same function or variable is defined in multiple files.",
      fix: "Ensure that the function or variable is defined only once and use `extern` for declarations in headers.",
    },
  ];

  const errors = [];
  const lines = terminalOutput.split("\n");
  let currentFunction = "an unknown function"; // Default context

  const functionRegex = /In function '(.*)'/i;

  lines.forEach((line, index) => {
    const functionMatch = line.match(functionRegex);
    if (functionMatch) {
      currentFunction = functionMatch[1]; // Update the current function context
      return; // Move to the next line
    }

    errorPatterns.forEach((pattern) => {
      const match = line.match(pattern.regex);
      if (match) {
        errors.push({
          line: index + 1,
          error: match[0],
          explanation: pattern.explanation,
          fix: pattern.fix,
          function: currentFunction, // Add the function context
        });
      }
    });
  });

  return errors;
}

// Function to analyze C++ compilation errors
function analyzeCppCompilation(command) {
  exec(command, (error, stdout, stderr) => {
    if (error) {
      // 'error' is non-null if the process exits with a non-zero code, indicating a failure.
      const errors = parseCppCompilationErrors(stderr);
      if (errors.length === 0) {
        const errorMessage =
          "Compilation failed with an unknown error. Check the terminal for details.";
        console.log(errorMessage);
        speakMessage(errorMessage);
        console.log(stderr);
      } else {
        console.log("C++ Compilation Errors Found:");
        let speechOutput = "C++ Compilation Errors Found. ";
        errors.forEach((err) => {
          const errorLocation = `In function ${err.function}, `;
          const errorLine = `Line ${err.line}: ${err.error}.`;
          const explanation = `Explanation: ${err.explanation}.`;
          const fix = `Potential Fix: ${err.fix}.`;
          console.log(errorLocation + errorLine);
          console.log(explanation);
          console.log(fix);
          console.log("---");
          speechOutput += `${errorLocation} ${errorLine} ${explanation} ${fix} `;
        });
        speakMessage(speechOutput);
      }
    } else {
      // No 'error' object means compilation was successful.
      const successMessage = "Compilation successful.";
      console.log(successMessage);
      speakMessage(successMessage);
      // stderr might still contain warnings, which you can optionally log or speak.
      if (stderr) {
        console.log("Compiler Warnings:\n" + stderr);
      }
    }
  });
}

// New function to determine the current C++ file and compile it
function compileCurrentCppFile(currentFilePath) {
  const fileExtension = path.extname(currentFilePath);
  const allowedExtensions = [".cpp", ".h", ".hpp"];

  if (!allowedExtensions.includes(fileExtension)) {
    const message =
      "This command can only be run from a C++ source or header file.";
    console.error(message);
    speakMessage(message);
    return;
  }

  try {
    const projectRoot = path.dirname(currentFilePath);
    const sourceFiles = findCppSourceFiles(projectRoot);

    if (sourceFiles.length === 0) {
      const message = "No C++ source files (.cpp) found to compile.";
      console.error(message);
      speakMessage(message);
      return;
    }

    // Construct the compilation command
    const outputFileName = path.basename(projectRoot); // Name executable after the folder
    const outputFilePath = path.join(projectRoot, outputFileName);
    const filesToCompile = sourceFiles.map((file) => `"${file}"`).join(" ");
    const compileCommand = `g++ ${filesToCompile} -o "${outputFilePath}"`;

    console.log(`Compiling project in: ${projectRoot}`);
    console.log(`Command: ${compileCommand}`);
    analyzeCppCompilation(compileCommand);
  } catch (e) {
    const errorMessage =
      "Failed to find source files or construct the compile command.";
    console.error(errorMessage, e);
    speakMessage(errorMessage);
  }
}

/**
 * Recursively finds all .cpp files in a directory.
 * @param {string} dir - The directory to search.
 * @returns {string[]} A list of full paths to .cpp files.
 */
function findCppSourceFiles(dir) {
  let files = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      files = files.concat(findCppSourceFiles(fullPath));
    } else if (item.isFile() && item.name.endsWith(".cpp")) {
      files.push(fullPath);
    }
  }
  return files;
}

// Export the functions for use in other modules
module.exports = {
  compileCurrentCppFile,
};
