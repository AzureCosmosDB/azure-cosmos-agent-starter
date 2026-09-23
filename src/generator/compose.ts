import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
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

export async function listScenarios(): Promise<Scenario[]> {
  const directory = join(sourceRoot, "scenarios");
  const entries = (await readdir(directory))
    .filter((entry) => entry.endsWith(".json"))
    .sort();
  return Promise.all(entries.map((entry) => loadScenario(entry.slice(0, -5))));
}

async function configureWebOption(destination: string, includeWeb: boolean): Promise<void> {
  if (includeWeb) return;
  await rm(join(destination, "apps", "web"), { recursive: true, force: true });
  const packagePath = join(destination, "package.json");
  const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as {
    workspaces?: string[];
    scripts?: Record<string, string>;
  };
  if (!packageJson.workspaces?.includes("apps/web")) return;
  packageJson.workspaces = packageJson.workspaces.filter((workspace) => workspace !== "apps/web");
  if (packageJson.scripts) {
    packageJson.scripts.dev = "npm run dev:api";
    packageJson.scripts.build = "tsc -p tsconfig.json";
    packageJson.scripts.typecheck = "tsc -p tsconfig.json --noEmit";
  }
  await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
  const dockerfilePath = join(destination, "Dockerfile");
  try {
    const dockerfile = await readFile(dockerfilePath, "utf8");
    await writeFile(
      dockerfilePath,
      dockerfile
        .split(/\r?\n/)
        .filter((line) => !line.includes("apps/web/package.json") && !line.includes("apps/web/dist"))
        .join("\n"),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
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
    scenario: scenario.id,
    hosting: "container-apps",
    cosmos: {
      api: "nosql",
      capacity: options.capacity,
      partitioning: "hierarchical",
      vectorSearch: true,
    },
    authentication: { production: "entra-id", local: options.localMode },
    features: scenario.capabilities,
  };
  await writeFile(join(destination, "cosmos-project.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await replaceTokens(destination, {
    PROJECT_NAME: destination.split(/[\\/]/).at(-1) ?? "cosmos-agent",
    CAPACITY: options.capacity,
    SCENARIO_ID: scenario.id,
    SCENARIO_NAME: scenario.name,
    SCENARIO_DESCRIPTION: scenario.description,
    SCENARIO_CATEGORY: scenario.category,
  });
  await configureWebOption(destination, options.includeWeb);
  await validateGeneratedFiles(destination);
  return destination;
}
