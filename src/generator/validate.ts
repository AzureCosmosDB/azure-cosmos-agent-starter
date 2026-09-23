import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { validateGeneratedFiles } from "./validation.js";

function run(command: string, args: string[], cwd: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const isWindowsNpm = process.platform === "win32" && command === "npm";
    const isWindowsAz = process.platform === "win32" && command === "az";
    const executable = isWindowsNpm
      ? process.execPath
      : isWindowsAz
        ? (process.env.ComSpec ?? "cmd.exe")
        : command;
    const commandArgs = isWindowsNpm
      ? [join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"), ...args]
      : isWindowsAz
        ? [
            "/d",
            "/s",
            "/c",
            ["az", ...args]
              .map((value) =>
                /^[A-Za-z0-9_.:\\/-]+$/.test(value)
                  ? value
                  : `"${value.replaceAll('"', '""')}"`,
              )
              .join(" "),
          ]
        : args;
    const child = spawn(executable, commandArgs, { cwd, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

export async function validateProject(root: string): Promise<number> {
  await validateGeneratedFiles(root);
  const packageJson = JSON.parse(await import("node:fs/promises").then(({ readFile }) => readFile(join(root, "package.json"), "utf8"))) as {
    scripts?: Record<string, string>;
  };
  for (const script of ["typecheck", "build", "test:unit", "test:security", "test:cost"]) {
    if (!packageJson.scripts?.[script]) continue;
    const code = await run("npm", ["run", script], root);
    if (code !== 0) return code;
  }
  try {
    await access(join(root, "infra", "main.bicep"));
    const available = await run("az", ["bicep", "version"], root);
    if (available !== 0) {
      console.warn("Azure CLI/Bicep validation was not available.");
    } else {
      const bicepCode = await run(
        "az",
        ["bicep", "build", "--file", join("infra", "main.bicep")],
        root,
      );
      if (bicepCode !== 0) return bicepCode;
    }
  } catch {
    console.warn("Azure CLI/Bicep validation was not available.");
  }
  return 0;
}
