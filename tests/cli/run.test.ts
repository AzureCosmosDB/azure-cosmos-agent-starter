import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../../src/cli/run.js";

const created: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(created.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("CLI execution", () => {
  it("prints help and version", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../../package.json", import.meta.url), "utf8"),
    ) as { version: string };
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await expect(runCli(["--help"])).resolves.toBe(0);
    expect(log.mock.calls.flat().join("\n")).toMatch(/Create options:/);
    log.mockClear();
    await expect(runCli(["--version"])).resolves.toBe(0);
    expect(log).toHaveBeenCalledWith(packageJson.version);
  });

  it("emits a JSON dry-run plan without writing files", async () => {
    const parent = await mkdtemp(join(tmpdir(), "cosmos-cli-dry-"));
    created.push(parent);
    const destination = join(parent, "planned");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await expect(
      runCli([destination, "--dry-run", "--json", "--capacity", "autoscale"]),
    ).resolves.toBe(0);
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
      command: "create",
      status: "planned",
      destination,
      options: { capacity: "autoscale" },
    });
    await expect(readFile(join(destination, "package.json"), "utf8")).rejects.toThrow();
  });

  it("creates noninteractively and emits machine-readable output", async () => {
    const destination = await mkdtemp(join(tmpdir(), "cosmos-cli-create-"));
    created.push(destination);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await expect(
      runCli([destination, "--yes", "--force", "--no-git", "--json"]),
    ).resolves.toBe(0);
    expect(JSON.parse(String(log.mock.calls.at(-1)?.[0]))).toMatchObject({
      command: "create",
      status: "created",
      destination,
    });
    expect(JSON.parse(await readFile(join(destination, "cosmos-project.json"), "utf8")))
      .toMatchObject({ cosmos: { capacity: "serverless" } });
  });
});
