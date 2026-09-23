import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { telemetry } from "../../packages/telemetry/src/index.js";

describe("cost and diagnostics", () => {
  it("captures request charges against fixture-specific baselines", () => {
    telemetry.cosmos("fixture-point-write", 4.2, 10, "cost-test");
    const diagnostics = telemetry.snapshot();
    expect(diagnostics.requestCharge).toBeGreaterThan(0);
    expect(diagnostics.requestCharge).toBeLessThanOrEqual(5.5);
  });
  it("rejects unbounded fetchAll patterns in the Cosmos store", async () => {
    const source = await readFile(new URL("../../packages/memory/src/index.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/\.fetchAll\s*\(/);
    expect(source).toMatch(/TOP \$\{limit\}/);
    expect(source).toMatch(/tenantId = @tenantId/);
  });
});
