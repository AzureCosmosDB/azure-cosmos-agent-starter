import { access, readdir } from "node:fs/promises";
import { join } from "node:path";

const requiredFiles = [
  "package.json",
  "cosmos-project.json",
  "azure.yaml",
  "docker-compose.yml",
  "infra/main.bicep",
  "packages/memory/src/index.ts",
  "packages/tools/src/index.ts",
  ".github/copilot-instructions.md",
];

export async function assertSafeDestination(destination: string, confirmed: boolean): Promise<void> {
  try {
    const entries = await readdir(destination);
    if (entries.length > 0 && !confirmed) {
      throw new Error(
        `Destination "${destination}" is not empty. Re-run with --yes only if overwriting is intended.`,
      );
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function validateGeneratedFiles(destination: string): Promise<void> {
  const missing: string[] = [];
  for (const file of requiredFiles) {
    try {
      await access(join(destination, file));
    } catch {
      missing.push(file);
    }
  }
  if (missing.length > 0) {
    throw new Error(`Generated project is incomplete. Missing: ${missing.join(", ")}`);
  }
}
