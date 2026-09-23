import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import type { Capacity, CliOptions, LocalMode } from "./arguments.js";

async function choose<T extends string>(
  question: string,
  allowed: readonly T[],
  fallback: T,
): Promise<T> {
  const readline = createInterface({ input: stdin, output: stdout });
  try {
    const answer = (await readline.question(`${question} (${allowed.join("/")}) [${fallback}]: `))
      .trim()
      .toLowerCase();
    if (!answer) return fallback;
    if (!allowed.includes(answer as T)) {
      throw new Error(`Expected one of: ${allowed.join(", ")}`);
    }
    return answer as T;
  } finally {
    readline.close();
  }
}

export async function completeInteractiveOptions(options: CliOptions): Promise<CliOptions> {
  if (options.yes) return options;
  const readline = createInterface({ input: stdin, output: stdout });
  let destination = options.destination;
  try {
    destination ||= (await readline.question("Project destination: ")).trim();
  } finally {
    readline.close();
  }
  if (!destination) throw new Error("A project destination is required.");

  const localMode = await choose<LocalMode>(
    "Local development mode",
    ["emulator", "azure"],
    options.localMode,
  );
  const capacity = await choose<Capacity>(
    "Azure capacity model",
    ["serverless", "autoscale"],
    options.capacity,
  );
  const web = await choose("Include example web interface", ["yes", "no"], "yes");
  const git = await choose("Initialize Git", ["yes", "no"], "yes");
  return {
    ...options,
    destination,
    localMode,
    capacity,
    includeWeb: web === "yes",
    initializeGit: git === "yes",
  };
}
