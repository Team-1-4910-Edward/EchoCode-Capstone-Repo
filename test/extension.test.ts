import "./helpers/vscodeMock.js";                // must be first to ensure loader + globals are ready
import { strict as assert } from "assert";
import { suite, test } from "mocha";

// For convenience in tests, import the mock members too:
import * as VS from "./helpers/vscodeMock.js";
const vscode: any = VS;

// Import the built extension (out/extension.js)
import * as ext from "../out/extension.js";

suite("EchoCode – Activation & Command Registration", () => {
  test("activates the extension in test mode", async () => {
    const ctx = vscode.__createMockContext();
    await ext.activate(ctx);
    assert.ok(true, "Extension activated without throwing");
  });

  test("registers helloWorld command via mock", async () => {
    const cmds = await vscode.commands.getCommands();
    console.log("Registered commands:", cmds);
    assert.ok(
      cmds.includes("echolint.helloWorld"),
      "echolint.helloWorld should be registered"
    );
  });

  test("executes helloWorld command without throwing", async () => {
    await assert.doesNotReject(() =>
      vscode.commands.executeCommand("echolint.helloWorld")
    );
  });
});