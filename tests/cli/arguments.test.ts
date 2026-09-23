import { describe, expect, it } from "vitest";
import { parseArguments } from "../../src/cli/arguments.js";

describe("CLI arguments", () => {
  it("selects noninteractive options", () => {
    expect(parseArguments(["demo", "--template", "agent-memory-ts", "--capacity", "autoscale", "--yes"]))
      .toMatchObject({ command: "create", destination: "demo", template: "agent-memory-ts", capacity: "autoscale", yes: true });
  });
  it("rejects invalid capacity", () => {
    expect(() => parseArguments(["demo", "--capacity", "invalid"])).toThrow(/capacity/i);
  });
});
