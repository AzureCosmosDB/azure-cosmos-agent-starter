import type { DoctorFinding } from "../generator/doctor.js";

export function printNextSteps(destination: string): void {
  console.log(`\nCreated Cosmos Agent Starter in ${destination}`);
  console.log("\nNext steps:");
  console.log(`  cd "${destination}"`);
  console.log("  npm install");
  console.log("  docker compose up -d");
  console.log("  npm run dev");
  console.log("\nAzure: azd up");
}

export function printFindings(findings: DoctorFinding[]): void {
  for (const finding of findings) {
    console.log(
      `[${finding.severity.toUpperCase()}] ${finding.code}: ${finding.message}\n` +
        `  Evidence: ${finding.evidence}\n  Remediation: ${finding.remediation}`,
    );
  }
  const counts = {
    error: findings.filter((finding) => finding.severity === "error").length,
    warning: findings.filter((finding) => finding.severity === "warning").length,
    info: findings.filter((finding) => finding.severity === "info").length,
  };
  console.log(`\nDoctor: ${counts.error} error(s), ${counts.warning} warning(s), ${counts.info} info`);
}
