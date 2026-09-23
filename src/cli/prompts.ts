import { createInterface, type Interface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import type {
  AIProvider,
  AuthMode,
  Capacity,
  CliOptions,
  LocalMode,
  StorageBackend,
} from "./arguments.js";
import { listScenarios } from "../generator/compose.js";

interface Choice<T extends string> {
  value: T;
  label: string;
  description: string;
}

async function choose<T extends string>(
  readline: Interface,
  question: string,
  choices: readonly Choice<T>[],
  fallback: T,
): Promise<T> {
  console.log(`\n${question}`);
  for (const [index, choice] of choices.entries()) {
    const marker = choice.value === fallback ? " (default)" : "";
    console.log(`  ${index + 1}. ${choice.label}${marker}`);
    console.log(`     ${choice.description}`);
  }
  const fallbackIndex = choices.findIndex((choice) => choice.value === fallback) + 1;
  const answer = (await readline.question(`Select an option [${fallbackIndex}]: `))
    .trim()
    .toLowerCase();
  if (!answer) return fallback;
  const selectedIndex = Number.parseInt(answer, 10);
  if (Number.isInteger(selectedIndex) && selectedIndex >= 1 && selectedIndex <= choices.length) {
    return choices[selectedIndex - 1]!.value;
  }
  const selected = choices.find((choice) => choice.value.toLowerCase() === answer);
  if (selected) return selected.value;
  throw new Error(`Choose a number from 1 to ${choices.length} or enter an option value.`);
}

export async function completeInteractiveOptions(options: CliOptions): Promise<CliOptions> {
  if (options.yes) return options;
  const readline = createInterface({ input: stdin, output: stdout });
  try {
    console.log(options.command === "bootstrap"
      ? "\nBootstrap Cosmos Agent guided setup"
      : "\nCreate Cosmos Agent guided setup");
    console.log("Press Enter to accept any default.");
    const destination =
      options.destination || (await readline.question("\nProject destination: ")).trim();
    if (!destination) throw new Error("A project destination is required.");

    const scenarios = await listScenarios();
    const template = await choose(
      readline,
      "What do you want to build?",
      scenarios.map((scenario) => ({
        value: scenario.id,
        label: scenario.name,
        description: scenario.description,
      })),
      options.template,
    );
    const provider = await choose<AIProvider>(
      readline,
      "Which AI provider should local development use?",
      [
        {
          value: "mock",
          label: "Local deterministic provider",
          description: "Starts immediately without credentials; development only.",
        },
        {
          value: "azure-openai",
          label: "Azure OpenAI",
          description: "Uses DefaultAzureCredential or an explicit development key.",
        },
        {
          value: "openai",
          label: "OpenAI",
          description: "Uses an OpenAI API key and configurable model.",
        },
        {
          value: "ollama",
          label: "Ollama",
          description: "Runs with a local or remote Ollama model server.",
        },
      ],
      options.provider,
    );
    const authMode = await choose<AuthMode>(
      readline,
      "How should users authenticate during development?",
      [
        {
          value: "local",
          label: "Local development identity",
          description: "Uses trusted tenant and user headers; blocked in production.",
        },
        {
          value: "entra",
          label: "Microsoft Entra ID",
          description: "Validates bearer tokens and enables MSAL sign-in in the React UI.",
        },
      ],
      options.authMode,
    );
    const storage = await choose<StorageBackend>(
      readline,
      "Where should development data be stored?",
      [
        {
          value: "in-memory",
          label: "In-memory",
          description: "Zero configuration and resets when the API restarts.",
        },
        {
          value: "cosmos",
          label: "Azure Cosmos DB",
          description: "Durable memory, knowledge, tickets, and action state.",
        },
      ],
      options.storage,
    );
    const localMode = await choose<LocalMode>(
      readline,
      "Which Cosmos DB connection should configuration target?",
      [
        {
          value: "emulator",
          label: "Local emulator",
          description: "Gateway connection with an emulator-only key.",
        },
        {
          value: "azure",
          label: "Azure",
          description: "Managed identity through DefaultAzureCredential.",
        },
      ],
      options.localMode,
    );
    const capacity = await choose<Capacity>(
      readline,
      "Which Azure Cosmos DB capacity model should infrastructure use?",
      [
        {
          value: "serverless",
          label: "Serverless",
          description: "Best for intermittent development and lower-volume workloads.",
        },
        {
          value: "autoscale",
          label: "Autoscale",
          description: "Best for variable production traffic with throughput guarantees.",
        },
      ],
      options.capacity,
    );
    const web = await choose(
      readline,
      "Include the React customer application?",
      [
        { value: "yes", label: "Yes", description: "Chat, knowledge, support, agents, and operations UI." },
        { value: "no", label: "No", description: "Generate an API-only project." },
      ],
      options.includeWeb ? "yes" : "no",
    );
    const git = await choose(
      readline,
      "Initialize a Git repository?",
      [
        { value: "yes", label: "Yes", description: "Create a new local Git repository." },
        { value: "no", label: "No", description: "Leave source control initialization to you." },
      ],
      options.initializeGit ? "yes" : "no",
    );
    const install = options.command === "bootstrap"
      ? await choose(
          readline,
          "Install project dependencies?",
          [
            { value: "yes", label: "Yes", description: "Run npm install after scaffolding." },
            { value: "no", label: "No", description: "Install dependencies later." },
          ],
          options.installDependencies ? "yes" : "no",
        )
      : "no";
    const link = options.command === "bootstrap"
      ? await choose(
          readline,
          "Link this directory to a local Cosmos Agent project context?",
          [
            { value: "yes", label: "Yes", description: "Create local environment context for Azure deployment." },
            { value: "no", label: "No", description: "Leave the generated directory unlinked." },
          ],
          options.linkProject ? "yes" : "no",
        )
      : "no";
    return {
      ...options,
      destination,
      template,
      provider,
      authMode,
      storage,
      localMode,
      capacity,
      includeWeb: web === "yes",
      initializeGit: git === "yes",
      installDependencies: install === "yes",
      linkProject: link === "yes",
    };
  } finally {
    readline.close();
  }
}
