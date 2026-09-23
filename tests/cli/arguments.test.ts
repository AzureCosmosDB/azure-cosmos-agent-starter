import { describe, expect, it } from "vitest";
import { parseArguments } from "../../src/cli/arguments.js";

describe("CLI arguments", () => {
  it("defaults to the customer-ready chat template", () => {
    expect(parseArguments(["demo"]).template).toBe("chat-agent-ts");
  });

  it("selects noninteractive options", () => {
    expect(
      parseArguments([
        "create",
        "demo",
        "-t",
        "agent-memory-ts",
        "--capacity=autoscale",
        "--local",
        "azure",
        "--provider",
        "ollama",
        "--auth",
        "entra",
        "--storage",
        "cosmos",
        "--no-web",
        "--no-git",
        "-y",
        "-f",
      ]),
    ).toMatchObject({
      command: "create",
      destination: "demo",
      template: "agent-memory-ts",
      capacity: "autoscale",
      localMode: "azure",
      provider: "ollama",
      authMode: "entra",
      storage: "cosmos",
      includeWeb: false,
      initializeGit: false,
      yes: true,
      force: true,
    });
  });

  it.each([
    [["-l"], "list"],
    [["--help"], "help"],
    [["-v"], "version"],
    [["doctor", "./sample"], "doctor"],
    [["validate", "-C", "./sample"], "validate"],
  ] as const)("supports command aliases for %j", (args, command) => {
    expect(parseArguments([...args])).toMatchObject({ command });
  });

  it("targets doctor and validate projects by positional argument or -C", () => {
    expect(parseArguments(["doctor", "./one"])).toMatchObject({ projectDirectory: "./one" });
    expect(parseArguments(["validate", "-C", "./two"])).toMatchObject({
      projectDirectory: "./two",
    });
  });

  it("rejects invalid capacity", () => {
    expect(() => parseArguments(["demo", "--capacity", "invalid"])).toThrow(/capacity/i);
  });

  it("supports the explicit wizard command", () => {
    expect(parseArguments(["wizard", "demo", "--yes"])).toMatchObject({
      command: "create",
      destination: "demo",
    });
  });

  it("rejects invalid provider, authentication, and storage options", () => {
    expect(() => parseArguments(["demo", "--provider", "invalid"])).toThrow(/provider/i);
    expect(() => parseArguments(["demo", "--auth", "invalid"])).toThrow(/authentication/i);
    expect(() => parseArguments(["demo", "--storage", "invalid"])).toThrow(/storage/i);
  });

  it("rejects unknown options, missing values, and conflicting modes", () => {
    expect(() => parseArguments(["demo", "--unknown"])).toThrow(/unknown option/i);
    expect(() => parseArguments(["demo", "--template"])).toThrow(/requires a value/i);
    expect(() => parseArguments(["demo", "--force", "--dry-run"])).toThrow(/cannot be used/i);
    expect(() => parseArguments(["doctor", "--force"])).toThrow(/only valid/i);
    expect(() => parseArguments(["list", "unexpected"])).toThrow(/positional/i);
    expect(() => parseArguments(["doctor", "--capacity", "autoscale"])).toThrow(
      /scaffolding options/i,
    );
    expect(() => parseArguments(["list", "-C", "./sample"])).toThrow(/project/i);
  });

  it("requires JSON creation to be noninteractive", () => {
    expect(() => parseArguments(["demo", "--json"])).toThrow(/noninteractive/i);
    expect(parseArguments(["demo", "--json", "--dry-run"]).json).toBe(true);
  });
});
