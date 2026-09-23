import { cp, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CliOptions } from "../cli/arguments.js";
import type { ProjectManifest, Scenario } from "./manifest.js";
import { assertSafeDestination, validateGeneratedFiles } from "./validation.js";

const sourceRoot = join(resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."), "src");

async function copyTemplate(source: string, destination: string): Promise<void> {
  await cp(source, destination, { recursive: true, force: true });
}

async function renameDotfiles(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await renameDotfiles(path);
    if (entry.name.startsWith("_dot_")) {
      await rename(path, join(directory, `.${entry.name.slice(5)}`));
    }
  }
}

async function replaceTokens(directory: string, tokens: Record<string, string>): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await replaceTokens(path, tokens);
      continue;
    }
    const content = await readFile(path, "utf8");
    let next = content;
    for (const [token, value] of Object.entries(tokens)) {
      next = next.replaceAll(`{{${token}}}`, value);
    }
    if (next !== content) await writeFile(path, next);
  }
}

export async function loadScenario(id: string): Promise<Scenario> {
  const scenarioPath = join(sourceRoot, "scenarios", `${id}.json`);
  try {
    return JSON.parse(await readFile(scenarioPath, "utf8")) as Scenario;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Unknown template "${id}". Run with --list to see supported templates.`);
    }
    throw error;
  }
}

export async function composeProject(options: CliOptions): Promise<string> {
  if (!options.destination) throw new Error("A destination is required.");
  const destination = resolve(options.destination);
  await assertSafeDestination(destination, options.force);
  const scenario = await loadScenario(options.template);
  await mkdir(destination, { recursive: true });
  await copyTemplate(join(sourceRoot, "bases", scenario.base, "template"), destination);
  for (const feature of scenario.features) {
    await copyTemplate(join(sourceRoot, "features", feature, "template"), destination);
  }
  await renameDotfiles(destination);
  const manifest: ProjectManifest = {
    schemaVersion: 1,
    language: "typescript",
    scenario: "agent-memory",
    hosting: "container-apps",
    cosmos: {
      api: "nosql",
      capacity: options.capacity,
      partitioning: "hierarchical",
      vectorSearch: true,
    },
    authentication: { production: "managed-identity", local: options.localMode },
    features: ["agent-memory", "approval-actions", "telemetry", "github-copilot"],
  };
  await writeFile(join(destination, "cosmos-project.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await replaceTokens(destination, {
    PROJECT_NAME: destination.split(/[\\/]/).at(-1) ?? "cosmos-agent",
    CAPACITY: options.capacity,
  });
  if (!options.includeWeb) {
    const web = join(destination, "apps", "web");
    try {
      if ((await stat(web)).isDirectory()) {
        await writeFile(join(web, "README.md"), "Web interface was excluded during generation.\n");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  await validateGeneratedFiles(destination);
  return destination;
}
