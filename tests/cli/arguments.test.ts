import { describe, expect, it } from "vitest";
import { parseArguments } from "../../src/cli/arguments.js";

describe("CLI arguments", () => {
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
