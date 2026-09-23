export type Capacity = "serverless" | "autoscale";
export type LocalMode = "emulator" | "azure";

export interface CliOptions {
  command: "create" | "list" | "doctor" | "validate";
  destination?: string;
  template: string;
  localMode: LocalMode;
  capacity: Capacity;
  includeWeb: boolean;
  initializeGit: boolean;
  yes: boolean;
}

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

export function parseArguments(args: string[]): CliOptions {
  const first = args[0];
  const command =
    first === "doctor" || first === "validate"
      ? first
      : args.includes("--list")
        ? "list"
        : "create";
  const destination =
    command === "create" && first && !first.startsWith("-") ? first : undefined;
  const capacity = valueAfter(args, "--capacity") ?? "serverless";
  const localMode = valueAfter(args, "--local") ?? "emulator";

  if (capacity !== "serverless" && capacity !== "autoscale") {
    throw new Error(`Unsupported capacity "${capacity}". Use serverless or autoscale.`);
  }
  if (localMode !== "emulator" && localMode !== "azure") {
    throw new Error(`Unsupported local mode "${localMode}". Use emulator or azure.`);
  }

  return {
    command,
    ...(destination ? { destination } : {}),
    template: valueAfter(args, "--template") ?? "agent-memory-ts",
    localMode,
    capacity,
    includeWeb: !args.includes("--no-web"),
    initializeGit: !args.includes("--no-git"),
    yes: args.includes("--yes") || args.includes("-y"),
  };
}
