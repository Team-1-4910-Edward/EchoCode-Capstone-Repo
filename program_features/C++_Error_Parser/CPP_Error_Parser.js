const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");

// Function to parse terminal output for C++ compilation errors
function parseCppCompilationErrors(terminalOutput) {
  const errorPatterns = [
    {
      regex: /error: expected ‘.*’ before ‘.*’/,
      explanation:
        "This error usually occurs when there is a missing semicolon, bracket, or syntax issue before the specified token.",
      fix: "Check the line mentioned in the error message and ensure all syntax is correct, including semicolons and brackets.",
    },
    {
      regex: /undefined reference to `(.*)'/,
      explanation:
        "This error indicates that the linker cannot find the definition of a function or variable.",
      fix: "Ensure that the function or variable is defined and that the appropriate library or object file is linked during compilation.",
    },
    {
      regex: /no matching function for call to ‘(.*)’/,
      explanation:
        "This error occurs when the function call does not match any available function signature.",
      fix: "Check the function call and ensure the arguments match the expected types and order.",
    },
    {
      regex: /‘(.*)’ was not declared in this scope/,
      explanation:
        "This error means that the variable or function has not been declared in the current scope.",
      fix: "Ensure that the variable or function is declared before use and that the necessary headers are included.",
    },
    {
      regex: /multiple definition of `(.*)'/,
      explanation:
        "This error occurs when the same function or variable is defined in multiple files.",
      fix: "Ensure that the function or variable is defined only once and use `extern` for declarations in headers.",
    },
  ];

  const errors = [];
  const lines = terminalOutput.split("\n");

  lines.forEach((line, index) => {
    errorPatterns.forEach((pattern) => {
      const match = line.match(pattern.regex);
      if (match) {
        errors.push({
          line: index + 1,
          error: match[0],
          explanation: pattern.explanation,
          fix: pattern.fix,
        });
      }
    });
  });

  return errors;
}

// Function to analyze C++ compilation errors
function analyzeCppCompilation(command) {
  exec(command, (error, stdout, stderr) => {
    if (stderr) {
      const errors = parseCppCompilationErrors(stderr);
      if (errors.length === 0) {
        console.log("No C++ compilation errors found.");
      } else {
        console.log("C++ Compilation Errors Found:");
        errors.forEach((error) => {
          console.log(`Line ${error.line}: ${error.error}`);
          console.log(`Explanation: ${error.explanation}`);
          console.log(`Potential Fix: ${error.fix}`);
          console.log("---");
        });
      }
    } else {
      console.log("Compilation successful.");
    }
  });
}

// New function to determine the current C++ file and compile it
function compileCurrentCppFile(currentFilePath) {
  // Ensure the file is a C++ file
  if (path.extname(currentFilePath) !== ".cpp") {
    console.error("The selected file is not a C++ file.");
    return;
  }

  // Construct the compilation command
  const fileName = path.basename(currentFilePath);
  const outputFileName = fileName.replace(".cpp", "");
  const compileCommand = `g++ "${currentFilePath}" -o "${outputFileName}"`;

  console.log(`Compiling ${fileName}...`);
  analyzeCppCompilation(compileCommand);
}

// Export the functions for use in other modules
module.exports = {
  analyzeTerminalOutput,
  compileCurrentCppFile,
};
