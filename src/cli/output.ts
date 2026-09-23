import type { DoctorFinding } from "../generator/doctor.js";

export const helpText = `create-cosmos-agent - scaffold secure Azure Cosmos DB agents

Usage:
  create-cosmos-agent [create] <destination> [options]
  create-cosmos-agent list [--json]
  create-cosmos-agent doctor [project] [--json]
  create-cosmos-agent validate [project] [--json]
  create-cosmos-agent completion <powershell|bash|zsh>

Commands:
  create [destination]  Create a project (default command)
  wizard [destination]  Create with a descriptive guided setup
  list                  List available templates
  doctor [project]      Report security and configuration findings
  validate [project]    Run generated-file, type, build, test, and Bicep checks
  completion <shell>    Print a dynamic shell completion script

Create options:
  -t, --template <id>        Scenario template (default: chat-agent-ts)
      --provider <provider>   mock | azure-openai | openai | ollama
      --auth <mode>           local | entra (default: local)
      --storage <backend>     in-memory | cosmos (default: in-memory)
      --local <mode>         emulator | azure (default: emulator)
      --capacity <model>     serverless | autoscale (default: serverless)
      --web / --no-web       Include or exclude the example web interface
      --git / --no-git       Initialize or skip a Git repository
  -y, --yes                  Accept prompt defaults; does not allow overwrites
  -f, --force                Allow generated files to overwrite a non-empty destination
      --dry-run              Print the resolved generation plan without writing files

General options:
  -C, --project <path>       Project directory for doctor or validate
      --json                 Emit machine-readable JSON
  -l, --list                 Alias for the list command
  -h, --help                 Show help
  -v, --version              Show version

Examples:
  create-cosmos-agent wizard my-agent
  create-cosmos-agent my-agent -t rag-agent-ts --capacity autoscale -y
  create-cosmos-agent create my-agent --provider azure-openai --auth entra -y
  create-cosmos-agent my-agent --dry-run --json
  create-cosmos-agent completion powershell
  create-cosmos-agent doctor ./my-agent
  create-cosmos-agent validate -C ./my-agent --json`;

export function nextSteps(destination: string): string[] {
  return [
    `cd "${destination}"`,
    "npm install",
    "npm run dev",
    "Open http://localhost:5173",
    "azd up",
  ];
}

export function printNextSteps(destination: string): void {
  console.log(`\nCreated Cosmos Agent Starter in ${destination}`);
  console.log("\nNext steps:");
  for (const step of nextSteps(destination).slice(0, -1)) console.log(`  ${step}`);
  console.log(`\nAzure: ${nextSteps(destination).at(-1)}`);
}

export function summarizeFindings(findings: DoctorFinding[]) {
  return {
    errors: findings.filter((finding) => finding.severity === "error").length,
    warnings: findings.filter((finding) => finding.severity === "warning").length,
    information: findings.filter((finding) => finding.severity === "info").length,
  };
}

export function printFindings(findings: DoctorFinding[]): void {
  for (const finding of findings) {
    console.log(
      `[${finding.severity.toUpperCase()}] ${finding.code}: ${finding.message}\n` +
        `  Evidence: ${finding.evidence}\n  Remediation: ${finding.remediation}`,
    );
  }
  const counts = summarizeFindings(findings);
  console.log(
    `\nDoctor: ${counts.errors} error(s), ${counts.warnings} warning(s), ` +
      `${counts.information} info`,
  );
}
