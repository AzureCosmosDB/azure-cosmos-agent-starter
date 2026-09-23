import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { composeProject } from "../../src/generator/compose.js";
import { validateGeneratedFiles } from "../../src/generator/validation.js";

const created: string[] = [];
afterEach(async () => Promise.all(created.splice(0).map((path) => rm(path, { recursive: true, force: true }))));
describe("generated-file validation", () => {
  it("passes for a composed project and fails for an empty folder", async () => {
    const good = await mkdtemp(join(tmpdir(), "cosmos-good-"));
    const bad = await mkdtemp(join(tmpdir(), "cosmos-bad-"));
    created.push(good, bad);
    await composeProject({
      command: "create", destination: good, template: "agent-memory-ts", localMode: "emulator",
      capacity: "serverless", includeWeb: true, initializeGit: false, yes: true,
    });
    await expect(validateGeneratedFiles(good)).resolves.toBeUndefined();
    await expect(validateGeneratedFiles(bad)).rejects.toThrow(/incomplete/i);
  });
});
