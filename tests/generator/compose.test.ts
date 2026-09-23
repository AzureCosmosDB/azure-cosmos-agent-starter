import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { composeProject, loadScenario } from "../../src/generator/compose.js";
import { runDoctor } from "../../src/generator/doctor.js";

const created: string[] = [];
afterEach(async () => Promise.all(created.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

async function destination(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "cosmos-agent-test-"));
  created.push(path);
  return path;
}
const options = (path: string) => ({
  command: "create" as const, destination: path, template: "agent-memory-ts",
  localMode: "emulator" as const, capacity: "serverless" as const,
  includeWeb: true, initializeGit: false, yes: true, force: true, dryRun: false,
  json: false, projectDirectory: ".",
});

describe("scenario composition", () => {
  it("loads the declarative scenario", async () => {
    expect((await loadScenario("agent-memory-ts")).features).toContain("agent-memory");
  });
  it("rejects an invalid template", async () => {
    await expect(loadScenario("missing")).rejects.toThrow(/unknown template/i);
  });
  it("generates deterministic manifest and required surfaces", async () => {
    const first = await destination();
    const second = await destination();
    await composeProject(options(first));
    await composeProject(options(second));
    expect(await readFile(join(first, "cosmos-project.json"), "utf8"))
      .toBe(await readFile(join(second, "cosmos-project.json"), "utf8"));
    expect(await readFile(join(first, ".github", "copilot-instructions.md"), "utf8")).toMatch(/DefaultAzureCredential/);
  });
  it("refuses a non-empty destination without confirmation", async () => {
    const path = await destination();
    await writeFile(join(path, "existing.txt"), "preserve me");
    await expect(composeProject({ ...options(path), force: false })).rejects.toThrow(/not empty/i);
  });
  it("doctor detects intentionally unsafe patterns", async () => {
    const path = await destination();
    await composeProject(options(path));
    await writeFile(join(path, "unsafe.ts"), "container.items.query(`SELECT * FROM c WHERE c.id = '${id}'`).fetchAll();");
    const findings = await runDoctor(path);
    expect(findings.map((finding) => finding.code)).toEqual(expect.arrayContaining(["UNBOUNDED_FETCH", "UNBOUNDED_SELECT"]));
  });
});
