import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface BootstrapCommand {
  executable: string;
  args: string[];
  cwd: string;
  silent: boolean;
}

export type BootstrapCommandRunner = (command: BootstrapCommand) => Promise<void>;

export interface BootstrapProjectOptions {
  destination: string;
  template: string;
  installDependencies: boolean;
  initializeGit: boolean;
  linkProject: boolean;
  deploy: boolean;
  environmentName?: string;
  silent?: boolean;
}

export interface BootstrapResult {
  destination: string;
  environmentName?: string;
  dependenciesInstalled: boolean;
  gitInitialized: boolean;
  linked: boolean;
  deployed: boolean;
}

interface ProjectContext {
  schemaVersion: 1;
  projectManifest: "cosmos-project.json";
  azureConfig: "azure.yaml";
  template: string;
  environmentName: string;
  deploymentStatus: "local" | "deployed";
  linkedAt: string;
  deployedAt?: string;
}

export function resolveEnvironmentName(destination: string, configured?: string): string {
  const candidate = configured?.trim() || basename(destination).toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,31}$/.test(candidate)) {
    throw new Error(
      'Azure environment names must start with a letter or number and contain at most 32 letters, numbers, or "-".',
    );
  }
  return candidate;
}

export const runBootstrapCommand: BootstrapCommandRunner = async (command) => {
  try {
    const result = await execFileAsync(command.executable, command.args, {
      cwd: command.cwd,
      maxBuffer: 20 * 1024 * 1024,
      windowsHide: true,
    });
    if (!command.silent) {
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (detail.includes("ENOENT")) {
      throw new Error(
        `Required command "${command.executable}" was not found. Install it and retry bootstrap.`,
      );
    }
    throw new Error(`${command.executable} ${command.args.join(" ")} failed: ${detail}`);
  }
};

async function writeContext(
  destination: string,
  context: ProjectContext,
): Promise<void> {
  const directory = join(destination, ".cosmos-agent");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "context.json"), `${JSON.stringify(context, null, 2)}\n`);
}

export async function bootstrapProject(
  options: BootstrapProjectOptions,
  runner: BootstrapCommandRunner = runBootstrapCommand,
): Promise<BootstrapResult> {
  const silent = options.silent ?? false;
  if (options.deploy && !options.linkProject) {
    throw new Error("Azure deployment requires a linked project context.");
  }
  if (options.installDependencies) {
    const npmCommand = process.platform === "win32"
      ? {
          executable: process.env.ComSpec || "cmd.exe",
          args: ["/d", "/s", "/c", "npm install"],
        }
      : { executable: "npm", args: ["install"] };
    await runner({
      ...npmCommand,
      cwd: options.destination,
      silent,
    });
  }
  if (options.initializeGit) {
    await runner({
      executable: "git",
      args: ["init"],
      cwd: options.destination,
      silent,
    });
  }
  const environmentName = options.linkProject
    ? resolveEnvironmentName(options.destination, options.environmentName)
    : undefined;
  const linkedAt = new Date().toISOString();
  if (environmentName) {
    await writeContext(options.destination, {
      schemaVersion: 1,
      projectManifest: "cosmos-project.json",
      azureConfig: "azure.yaml",
      template: options.template,
      environmentName,
      deploymentStatus: "local",
      linkedAt,
    });
  }
  if (options.deploy && environmentName) {
    await runner({
      executable: "azd",
      args: ["up", "--environment", environmentName, "--no-prompt"],
      cwd: options.destination,
      silent,
    });
    await writeContext(options.destination, {
      schemaVersion: 1,
      projectManifest: "cosmos-project.json",
      azureConfig: "azure.yaml",
      template: options.template,
      environmentName,
      deploymentStatus: "deployed",
      linkedAt,
      deployedAt: new Date().toISOString(),
    });
  }
  return {
    destination: options.destination,
    ...(environmentName ? { environmentName } : {}),
    dependenciesInstalled: options.installDependencies,
    gitInitialized: options.initializeGit,
    linked: options.linkProject,
    deployed: options.deploy,
  };
}
