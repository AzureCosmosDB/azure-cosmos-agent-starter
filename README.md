# create-cosmos-agent

Build production-oriented TypeScript AI agents with a guided CLI and an Azure Cosmos DB production path.

[![npm version](https://img.shields.io/npm/v/create-cosmos-agent?logo=npm&color=CB3837)](https://www.npmjs.com/package/create-cosmos-agent)
[![npm downloads](https://img.shields.io/npm/dm/create-cosmos-agent?logo=npm)](https://www.npmjs.com/package/create-cosmos-agent)
[![Node.js](https://img.shields.io/node/v/create-cosmos-agent?logo=node.js)](https://www.npmjs.com/package/create-cosmos-agent)
[![GitHub stars](https://img.shields.io/github/stars/sajeetharan/cosmos-agent-starter?logo=github)](https://github.com/sajeetharan/cosmos-agent-starter/stargazers)
[![License](https://img.shields.io/github/license/sajeetharan/cosmos-agent-starter)](LICENSE)

[npm package](https://www.npmjs.com/package/create-cosmos-agent) ·
[documentation](#quickstart) ·
[report an issue](https://github.com/sajeetharan/cosmos-agent-starter/issues) ·
[contribute](CONTRIBUTING.md)

`create-cosmos-agent` generates a complete API and React application with memory, vector retrieval,
tenant isolation, approval-gated actions, telemetry, tests, containers, and Azure infrastructure.
Start locally without cloud credentials, then move to Microsoft Entra ID, Azure OpenAI, and Azure
Cosmos DB without replacing the application contracts.

## See it in action

[![create-cosmos-agent overview preview](docs/media/create-cosmos-agent-preview.gif)](https://raw.githubusercontent.com/sajeetharan/cosmos-agent-starter/main/docs/media/create-cosmos-agent-overview.mp4)

[Watch the full overview video](https://raw.githubusercontent.com/sajeetharan/cosmos-agent-starter/main/docs/media/create-cosmos-agent-overview.mp4).

## Quickstart

Requires Node.js 20 or later.

```powershell
npx create-cosmos-agent@latest my-agent --yes
cd my-agent
npm install
npm run dev
```

Open `http://localhost:5173`.

The generated project starts with safe local defaults:

- deterministic mock AI;
- local development authentication;
- in-memory storage.

No Azure subscription, model key, database, or Docker installation is required for the first run.

## Guided setup

Use the wizard to choose the scenario, model provider, authentication, storage, capacity, and web
experience:

```powershell
npx create-cosmos-agent@latest wizard my-agent
```

## Templates

| Template | Use case |
|---|---|
| `chat-agent-ts` | Conversational assistants with memory and safe actions |
| `rag-agent-ts` | Grounded document Q&A with vector retrieval and citations |
| `customer-support-ts` | Customer context, ticket workflows, and approvals |
| `event-agent-ts` | Service Bus-triggered agents with idempotency, retries, and dead-lettering |
| `multi-agent-ts` | Planner, specialist, and reviewer workflows |
| `agent-memory-ts` | Lightweight tenant-safe memory and approval primitives |

Choose a template directly:

```powershell
npx create-cosmos-agent@latest knowledge-agent --template rag-agent-ts --yes
```

Create an event-driven worker:

```powershell
npx create-cosmos-agent@latest mail-agent --template event-agent-ts --yes
```

The event worker reads newline-delimited JSON from stdin locally and uses Azure Service Bus in
production. Its validated event envelope carries the tenant and subject scope, while stable event
IDs make memory and approval writes safe when Service Bus redelivers a message.

```json
{
  "id": "event-00000001",
  "type": "mail.received",
  "source": "gmail",
  "tenantId": "tenant-a",
  "subjectId": "user-a",
  "occurredAt": "2026-09-23T12:00:00.000Z",
  "data": {
    "objective": "Summarize the new message.",
    "threadId": "mailbox"
  }
}
```

## Production choices

Generate an Azure-oriented configuration when you are ready:

```powershell
npx create-cosmos-agent@latest my-agent `
  --provider azure-openai `
  --auth entra `
  --storage cosmos `
  --capacity serverless `
  --yes
```

Generated production foundations include:

- Azure Cosmos DB for NoSQL with tenant-safe partitioning;
- Microsoft Entra ID authentication;
- Azure OpenAI, OpenAI-compatible, Ollama, and mock providers;
- approval evidence, idempotency, and optimistic concurrency;
- Docker, Bicep, Azure Container Apps, Application Insights, and `azd`.

## Essential commands

| Command | Purpose |
|---|---|
| `create-cosmos-agent wizard <name>` | Create a project with guided choices |
| `create-cosmos-agent <name> --yes` | Create with recommended defaults |
| `create-cosmos-agent list` | List available templates |
| `create-cosmos-agent doctor <project>` | Inspect configuration and security patterns |
| `create-cosmos-agent validate <project>` | Validate generated files, builds, tests, and Bicep |
| `create-cosmos-agent completion <shell>` | Enable PowerShell, Bash, or Zsh completion |

Run `npx create-cosmos-agent@latest --help` for every option.

## Validate a generated project

```powershell
npm run typecheck
npm test
npm run build
```

Deploy Azure resources from the generated project with:

```powershell
azd auth login
azd up
```

Azure deployment can create billable resources.

## Corporate npm proxy fallback

If your corporate npm proxy has not mirrored the latest release, download the `.tgz` package from
[GitHub Releases](https://github.com/sajeetharan/cosmos-agent-starter/releases) and run:

```powershell
npx --yes --package .\create-cosmos-agent-0.3.0.tgz create-cosmos-agent my-agent --yes
```

## Develop the CLI

```powershell
git clone https://github.com/sajeetharan/cosmos-agent-starter.git
cd cosmos-agent-starter
npm install
npm run validate
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidance and
[SECURITY.md](SECURITY.md) for vulnerability reporting.

## License

[MIT](LICENSE)
