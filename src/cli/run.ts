import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { parseArguments } from "./arguments.js";
import { completeInteractiveOptions } from "./prompts.js";
import {
  helpText,
  nextSteps,
  printFindings,
  printNextSteps,
  summarizeFindings,
} from "./output.js";
import { composeProject, loadScenario } from "../generator/compose.js";
import { runDoctor } from "../generator/doctor.js";
import { validateProject } from "../generator/validate.js";

const execFileAsync = promisify(execFile);

async function packageVersion(): Promise<string> {
  const packagePath = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json");
  const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as { version: string };
  return packageJson.version;
}

function writeJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export async function runCli(args: string[]): Promise<number> {
  let json = args.includes("--json");
  try {
    let options = parseArguments(args);
    json = options.json;
    if (options.command === "help") {
      console.log(helpText);
      return 0;
    }
    if (options.command === "version") {
      const version = await packageVersion();
      if (options.json) writeJson({ name: "create-cosmos-agent", version });
      else console.log(version);
      return 0;
    }
    if (options.command === "list") {
      const scenario = await loadScenario("agent-memory-ts");
      if (options.json) writeJson({ templates: [scenario] });
      else console.log(`${scenario.id}\t${scenario.name}`);
      return 0;
    }
    if (options.command === "doctor") {
      const project = resolve(options.projectDirectory);
      const findings = await runDoctor(project);
      const summary = summarizeFindings(findings);
      if (options.json) {
        writeJson({
          command: "doctor",
          project,
          status: summary.errors > 0 ? "failed" : "passed",
          summary,
          findings,
        });
      } else {
        printFindings(findings);
      }
      return summary.errors > 0 ? 1 : 0;
    }
    if (options.command === "validate") {
      const project = resolve(options.projectDirectory);
      const exitCode = await validateProject(project, { silent: options.json });
      if (options.json) {
        writeJson({
          command: "validate",
          project,
          status: exitCode === 0 ? "passed" : "failed",
          exitCode,
        });
      }
      return exitCode;
    }
    if (options.json && !options.destination) {
      throw new Error("JSON creation requires a destination.");
    }
    if (!options.dryRun) options = await completeInteractiveOptions(options);
    if (!options.destination) throw new Error("A project destination is required.");
    const destination = resolve(options.destination);
    const scenario = await loadScenario(options.template);
    if (options.dryRun) {
      const plan = {
        command: "create",
        status: "planned",
        destination,
        template: { id: scenario.id, name: scenario.name },
        options: {
          localMode: options.localMode,
          capacity: options.capacity,
          includeWeb: options.includeWeb,
          initializeGit: options.initializeGit,
          force: options.force,
        },
      };
      if (options.json) writeJson(plan);
      else {
        console.log("Generation plan:");
        console.log(JSON.stringify(plan, null, 2));
      }
      return 0;
    }
    const created = await composeProject(options);
    if (options.initializeGit) await execFileAsync("git", ["init"], { cwd: created });
    if (options.json) {
      writeJson({
        command: "create",
        status: "created",
        destination: created,
        template: scenario.id,
        nextSteps: nextSteps(created),
      });
    } else {
      printNextSteps(created);
    }
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (json) console.error(JSON.stringify({ status: "error", message }));
    else console.error(`Error: ${message}\nRun with --help for usage.`);
    return 1;
  }
}
