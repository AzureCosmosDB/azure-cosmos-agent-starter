import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { composeProject, listScenarios, loadScenario } from "../../src/generator/compose.js";
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
  it("lists every customer scenario", async () => {
    expect((await listScenarios()).map((scenario) => scenario.id)).toEqual([
      "agent-memory-ts",
      "chat-agent-ts",
      "customer-support-ts",
      "multi-agent-ts",
      "rag-agent-ts",
    ]);
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
  it("composes every customer template with scenario-specific metadata", async () => {
    for (const template of [
      "chat-agent-ts",
      "rag-agent-ts",
      "customer-support-ts",
      "multi-agent-ts",
    ]) {
      const path = await destination();
      await composeProject({ ...options(path), template });
      const manifest = JSON.parse(await readFile(join(path, "cosmos-project.json"), "utf8")) as {
        scenario: string;
      };
      expect(manifest.scenario).toBe(template);
      expect(await readFile(join(path, "apps", "web", "src", "App.tsx"), "utf8"))
        .toContain("Context-aware assistant");
      expect(await readFile(join(path, "apps", "api", "src", "server.ts"), "utf8"))
        .toContain(`id: "${template}"`);
    }
  });
  it("produces a buildable API-only layout with --no-web", async () => {
    const path = await destination();
    await composeProject({ ...options(path), template: "chat-agent-ts", includeWeb: false });
    const packageJson = JSON.parse(await readFile(join(path, "package.json"), "utf8")) as {
      workspaces: string[];
      scripts: Record<string, string>;
    };
    expect(packageJson.workspaces).not.toContain("apps/web");
    expect(packageJson.scripts.dev).toBe("npm run dev:api");
    expect(await readFile(join(path, "Dockerfile"), "utf8")).not.toContain("apps/web");
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
