export type Capacity = "serverless" | "autoscale";
export type LocalMode = "emulator" | "azure";
export type CliCommand = "create" | "list" | "doctor" | "validate" | "help" | "version";

export interface CliOptions {
  command: CliCommand;
  destination?: string;
  projectDirectory: string;
  template: string;
  localMode: LocalMode;
  capacity: Capacity;
  includeWeb: boolean;
  initializeGit: boolean;
  yes: boolean;
  force: boolean;
  dryRun: boolean;
  json: boolean;
}

const valueFlags = new Map<string, "template" | "capacity" | "localMode" | "projectDirectory">([
  ["--template", "template"],
  ["-t", "template"],
  ["--capacity", "capacity"],
  ["--local", "localMode"],
  ["--project", "projectDirectory"],
  ["-C", "projectDirectory"],
] as const);

const booleanFlags = new Set([
  "--list",
  "-l",
  "--yes",
  "-y",
  "--force",
  "-f",
  "--dry-run",
  "--json",
  "--web",
  "--no-web",
  "--git",
  "--no-git",
  "--help",
  "-h",
  "--version",
  "-v",
]);

function normalizeArgs(args: string[]): string[] {
  return args.map((argument) => {
    if (!argument.startsWith("--") || !argument.includes("=")) return argument;
    const [flag, ...value] = argument.split("=");
    return [flag, value.join("=")].join("\0");
  }).flatMap((argument) => argument.split("\0"));
}

export function parseArguments(rawArgs: string[]): CliOptions {
  const args = normalizeArgs(rawArgs);
  const first = args[0];
  const explicitCommand =
    first === "create" || first === "doctor" || first === "validate" || first === "list"
      ? first
      : undefined;
  const commandOffset = explicitCommand ? 1 : 0;
  let command: CliCommand = explicitCommand ?? "create";
  let template = "agent-memory-ts";
  let capacity: string = "serverless";
  let localMode: string = "emulator";
  let projectDirectory = ".";
  let destination: string | undefined;
  let includeWeb = true;
  let initializeGit = true;
  let yes = false;
  let force = false;
  let dryRun = false;
  let json = false;

  for (let index = commandOffset; index < args.length; index += 1) {
    const argument = args[index]!;
    const valueKey = valueFlags.get(argument);
    if (valueKey) {
      const value = args[index + 1];
      if (!value || value.startsWith("-")) {
        throw new Error(`Option "${argument}" requires a value.`);
      }
      if (valueKey === "template") template = value;
      if (valueKey === "capacity") capacity = value;
      if (valueKey === "localMode") localMode = value;
      if (valueKey === "projectDirectory") projectDirectory = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("-") && !booleanFlags.has(argument)) {
      throw new Error(`Unknown option "${argument}". Run with --help for usage.`);
    }
    switch (argument) {
      case "--help":
      case "-h":
        command = "help";
        break;
      case "--version":
      case "-v":
        command = "version";
        break;
      case "--list":
      case "-l":
        command = "list";
        break;
      case "--yes":
      case "-y":
        yes = true;
        break;
      case "--force":
      case "-f":
        force = true;
        break;
      case "--dry-run":
        dryRun = true;
        break;
      case "--json":
        json = true;
        break;
      case "--web":
        includeWeb = true;
        break;
      case "--no-web":
        includeWeb = false;
        break;
      case "--git":
        initializeGit = true;
        break;
      case "--no-git":
        initializeGit = false;
        break;
      default:
        if (argument.startsWith("-")) break;
        if (explicitCommand === "doctor" || explicitCommand === "validate") {
          if (projectDirectory !== ".") {
            throw new Error(`Only one project directory can be specified for ${explicitCommand}.`);
          }
          projectDirectory = argument;
        } else if (command === "create") {
          if (destination) throw new Error("Only one destination can be specified.");
          destination = argument;
        } else {
          throw new Error(`The ${command} command does not accept a positional argument.`);
        }
    }
  }

  if (capacity !== "serverless" && capacity !== "autoscale") {
    throw new Error(`Unsupported capacity "${capacity}". Use serverless or autoscale.`);
  }
  if (localMode !== "emulator" && localMode !== "azure") {
    throw new Error(`Unsupported local mode "${localMode}". Use emulator or azure.`);
  }
  if (force && dryRun) {
    throw new Error("--force and --dry-run cannot be used together.");
  }
  if (command !== "create" && (force || dryRun)) {
    throw new Error(`--force and --dry-run are only valid with the create command.`);
  }
  const createOnlyFlags = [
    "--template",
    "-t",
    "--capacity",
    "--local",
    "--web",
    "--no-web",
    "--git",
    "--no-git",
    "--yes",
    "-y",
  ];
  if (
    command !== "create" &&
    command !== "help" &&
    command !== "version" &&
    createOnlyFlags.some((flag) => args.includes(flag))
  ) {
    throw new Error(`Scaffolding options are only valid with the create command.`);
  }
  if (command === "list" && projectDirectory !== ".") {
    throw new Error("--project is only valid with doctor or validate.");
  }
  if (json && command === "create" && !yes && !dryRun) {
    throw new Error("JSON creation must be noninteractive. Add --yes or use --dry-run.");
  }

  return {
    command,
    ...(destination ? { destination } : {}),
    projectDirectory,
    template,
    localMode,
    capacity,
    includeWeb,
    initializeGit,
    yes,
    force,
    dryRun,
    json,
  };
}
