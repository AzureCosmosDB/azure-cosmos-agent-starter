import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseArguments } from "./arguments.js";
import { completeInteractiveOptions } from "./prompts.js";
import { printFindings, printNextSteps } from "./output.js";
import { composeProject, loadScenario } from "../generator/compose.js";
import { runDoctor } from "../generator/doctor.js";
import { validateProject } from "../generator/validate.js";

const execFileAsync = promisify(execFile);

export async function runCli(args: string[]): Promise<number> {
  try {
    let options = parseArguments(args);
    if (options.command === "list") {
      const scenario = await loadScenario("agent-memory-ts");
      console.log(`${scenario.id}\t${scenario.name}`);
      return 0;
    }
    if (options.command === "doctor") {
      const findings = await runDoctor(process.cwd());
      printFindings(findings);
      return findings.some((finding) => finding.severity === "error") ? 1 : 0;
    }
    if (options.command === "validate") return await validateProject(process.cwd());
    options = await completeInteractiveOptions(options);
    const destination = await composeProject(options);
    if (options.initializeGit) {
      await execFileAsync("git", ["init"], { cwd: destination });
    }
    printNextSteps(destination);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? `Error: ${error.message}` : error);
    return 1;
  }
}
