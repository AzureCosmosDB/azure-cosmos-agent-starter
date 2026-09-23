import type { Scenario } from "../generator/manifest.js";

export type CompletionShell = "powershell" | "bash" | "zsh";

export interface CompletionCandidate {
  value: string;
  description: string;
}

const commands: CompletionCandidate[] = [
  { value: "wizard", description: "Create a project with guided choices" },
  { value: "create", description: "Create a project" },
  { value: "bootstrap", description: "Scaffold, install, link, and optionally deploy a project" },
  { value: "list", description: "List scenario templates" },
  { value: "doctor", description: "Inspect security and configuration" },
  { value: "validate", description: "Validate a generated project" },
  { value: "completion", description: "Print shell completion setup" },
];

const flags: CompletionCandidate[] = [
  { value: "--template", description: "Scenario template" },
  { value: "--provider", description: "AI provider" },
  { value: "--auth", description: "Development authentication mode" },
  { value: "--storage", description: "Development storage backend" },
  { value: "--local", description: "Cosmos connection target" },
  { value: "--capacity", description: "Azure Cosmos DB capacity" },
  { value: "--web", description: "Include the React application" },
  { value: "--no-web", description: "Exclude the React application" },
  { value: "--git", description: "Initialize Git" },
  { value: "--no-git", description: "Skip Git initialization" },
  { value: "--install", description: "Install dependencies during bootstrap" },
  { value: "--no-install", description: "Skip dependency installation" },
  { value: "--link", description: "Create local project context" },
  { value: "--no-link", description: "Skip local project context" },
  { value: "--environment", description: "Azure environment name" },
  { value: "--deploy", description: "Provision and deploy with Azure Developer CLI" },
  { value: "--yes", description: "Accept defaults without prompting" },
  { value: "--force", description: "Overlay a non-empty destination" },
  { value: "--dry-run", description: "Print the generation plan" },
  { value: "--json", description: "Emit machine-readable JSON" },
  { value: "--help", description: "Show help" },
  { value: "--version", description: "Show version" },
];

const valuesByFlag: Record<string, CompletionCandidate[]> = {
  "--provider": [
    { value: "mock", description: "Deterministic local development provider" },
    { value: "azure-openai", description: "Azure OpenAI with managed identity or key" },
    { value: "openai", description: "OpenAI-compatible API" },
    { value: "ollama", description: "Local or remote Ollama server" },
  ],
  "--auth": [
    { value: "local", description: "Trusted local development headers" },
    { value: "entra", description: "Microsoft Entra ID authentication" },
  ],
  "--storage": [
    { value: "in-memory", description: "Zero-configuration ephemeral storage" },
    { value: "cosmos", description: "Durable Azure Cosmos DB storage" },
  ],
  "--local": [
    { value: "emulator", description: "Local Cosmos DB emulator" },
    { value: "azure", description: "Azure Cosmos DB account" },
  ],
  "--capacity": [
    { value: "serverless", description: "Pay-per-request serverless capacity" },
    { value: "autoscale", description: "Autoscale provisioned throughput" },
  ],
  completion: [
    { value: "powershell", description: "PowerShell native argument completer" },
    { value: "bash", description: "Bash completion function" },
    { value: "zsh", description: "Zsh completion function" },
  ],
};

function matches(candidates: CompletionCandidate[], prefix: string): CompletionCandidate[] {
  return candidates.filter((candidate) => candidate.value.startsWith(prefix));
}

export function completionCandidates(
  words: string[],
  scenarios: Scenario[],
): CompletionCandidate[] {
  const current = words.at(-1) ?? "";
  const previous = words.at(-2);
  if (previous === "--template") {
    return matches(
      scenarios.map((scenario) => ({ value: scenario.id, description: scenario.description })),
      current,
    );
  }
  if (previous && valuesByFlag[previous]) return matches(valuesByFlag[previous], current);
  if (words[0] === "completion") {
    return matches(valuesByFlag.completion!, words.length === 1 ? "" : current);
  }
  for (const [flag, candidates] of Object.entries(valuesByFlag)) {
    if (current.startsWith(`${flag}=`)) {
      const prefix = current.slice(flag.length + 1);
      return matches(candidates, prefix).map((candidate) => ({
        ...candidate,
        value: `${flag}=${candidate.value}`,
      }));
    }
  }
  if (current === "--template=") {
    return scenarios.map((scenario) => ({
      value: `--template=${scenario.id}`,
      description: scenario.description,
    }));
  }
  if (current.startsWith("-")) return matches(flags, current);
  if (words.length <= 1) return matches(commands, current);
  return [];
}

export function formatCompletionCandidates(candidates: CompletionCandidate[]): string {
  return candidates.map((candidate) => `${candidate.value}\t${candidate.description}`).join("\n");
}

export function completionScript(shell: CompletionShell): string {
  if (shell === "powershell") {
    return `Register-ArgumentCompleter -Native -CommandName create-cosmos-agent -ScriptBlock {
  param($wordToComplete, $commandAst, $cursorPosition)
  $arguments = @($commandAst.CommandElements | Select-Object -Skip 1 | ForEach-Object { $_.Extent.Text })
  create-cosmos-agent __complete @arguments | ForEach-Object {
    $parts = $_ -split "\`t", 2
    [System.Management.Automation.CompletionResult]::new($parts[0], $parts[0], "ParameterValue", $parts[1])
  }
}`;
  }
  if (shell === "bash") {
    return `_create_cosmos_agent() {
  local line value current="\${COMP_WORDS[COMP_CWORD]}"
  COMPREPLY=()
  while IFS= read -r line; do
    value="\${line%%$'\\t'*}"
    [[ "$value" == "$current"* ]] && COMPREPLY+=("$value")
  done < <(create-cosmos-agent __complete "\${COMP_WORDS[@]:1}")
}
complete -F _create_cosmos_agent create-cosmos-agent`;
  }
  return `#compdef create-cosmos-agent
_create_cosmos_agent() {
  local -a values
  local line
  while IFS= read -r line; do
    values+=("\${line//$'\\t'/:}")
  done < <(create-cosmos-agent __complete "\${words[@]:1}")
  _describe 'create-cosmos-agent options' values
}
compdef _create_cosmos_agent create-cosmos-agent`;
}
