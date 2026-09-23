import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import type { ProjectManifest } from "./manifest.js";

export type FindingSeverity = "error" | "warning" | "info";
export interface DoctorFinding {
  severity: FindingSeverity;
  code: string;
  message: string;
  evidence: string;
  remediation: string;
}

async function filesUnder(root: string): Promise<string[]> {
  const results: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (["node_modules", "dist", ".git"].includes(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else results.push(path);
    }
  }
  await visit(root);
  return results;
}

function finding(
  severity: FindingSeverity,
  code: string,
  message: string,
  evidence: string,
  remediation: string,
): DoctorFinding {
  return { severity, code, message, evidence, remediation };
}

export async function runDoctor(root: string): Promise<DoctorFinding[]> {
  const findings: DoctorFinding[] = [];
  if (Number(process.versions.node.split(".")[0]) < 20) {
    findings.push(finding("error", "NODE_VERSION", "Node.js 20+ is required", process.version, "Install Node.js 20 or newer."));
  }
  let manifest: ProjectManifest | undefined;
  try {
    manifest = JSON.parse(await readFile(join(root, "cosmos-project.json"), "utf8")) as ProjectManifest;
  } catch {
    findings.push(finding("error", "MANIFEST_MISSING", "cosmos-project.json is missing or invalid", "No readable manifest", "Restore the generated project manifest."));
    return findings;
  }
  const files = await filesUnder(root);
  const textFiles = files.filter((file) => /\.(?:ts|js|json|bicep|ya?ml|env|md)$/.test(file));
  for (const file of textFiles) {
    const content = await readFile(file, "utf8");
    const evidence = relative(root, file);
    if (/\.fetchAll\s*\(/.test(content)) {
      findings.push(finding("error", "UNBOUNDED_FETCH", "fetchAll can create unbounded reads", evidence, "Use byPage() with a bounded page size and continuation tokens."));
    }
    if (/SELECT\s+\*/i.test(content) && !/TOP\s+\d+/i.test(content)) {
      findings.push(finding("warning", "UNBOUNDED_SELECT", "Unbounded SELECT * detected", evidence, "Project required fields and add TOP or pagination."));
    }
    if (/SELECT.+\$\{(?!limit\})/i.test(content)) {
      findings.push(finding("error", "QUERY_INTERPOLATION", "Interpolated query text detected", evidence, "Use named query parameters."));
    }
    if (/COSMOS_(?:KEY|CONNECTION_STRING)\s*=/i.test(content) && !evidence.includes(".env.example")) {
      findings.push(finding("error", "PRODUCTION_KEY", "Cosmos account-key configuration detected", evidence, "Use DefaultAzureCredential and Managed Identity in production."));
    }
  }
  const all = await Promise.all(textFiles.map((file) => readFile(file, "utf8")));
  const combined = all.join("\n");
  if (!combined.includes("tenantId") || !combined.includes("RequestContext")) {
    findings.push(finding("error", "TENANT_CONTEXT", "Trusted tenant context propagation is missing", "No RequestContext/tenantId contract", "Derive tenant and user identity from authenticated request context."));
  }
  if (!combined.includes("continuationToken") && !combined.includes("byPage")) {
    findings.push(finding("warning", "PAGINATION", "No pagination implementation detected", "No continuation token usage", "Add bounded byPage() reads."));
  }
  if (!combined.includes("@opentelemetry/api")) {
    findings.push(finding("warning", "TELEMETRY", "OpenTelemetry integration is missing", "No OpenTelemetry API import", "Instrument Cosmos and agent operations."));
  }
  if (!combined.includes("DefaultAzureCredential")) {
    findings.push(finding("error", "MANAGED_IDENTITY", "Managed Identity client setup is missing", "No DefaultAzureCredential", "Use DefaultAzureCredential with the Cosmos endpoint."));
  }
  if (manifest.cosmos.vectorSearch && (!combined.includes("vectorEmbeddingPolicy") || !combined.includes("vectorIndexes"))) {
    findings.push(finding("error", "VECTOR_POLICY", "Vector-enabled manifest lacks a vector policy", "cosmos.vectorSearch=true", "Define vectorEmbeddingPolicy and vectorIndexes when creating agent-state."));
  }
  if (
    manifest.cosmos.capacity === "serverless" &&
    /autoscaleSettings|maxThroughput/.test(combined) &&
    !/capacity\s*==\s*['"]autoscale['"]/.test(combined)
  ) {
    findings.push(finding("error", "CAPACITY_CONFLICT", "Serverless configuration also provisions throughput", "Serverless manifest with autoscale settings", "Do not set provisioned throughput for serverless accounts."));
  }
  if (findings.length === 0) {
    findings.push(finding("info", "HEALTHY", "No static safety issues found", "All checks passed", "Continue running validate in CI."));
  }
  return findings;
}
