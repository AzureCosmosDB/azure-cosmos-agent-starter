# Cosmos Agent Starter

`create-cosmos-agent` is an open-source, composable CLI for scaffolding secure Azure Cosmos DB
applications and AI agents. The first scenario is a strict TypeScript agent with durable,
tenant-safe memory, bounded vector retrieval, provenance citations, user deletion, diagnostics,
and an approval-gated consequential action.

## Requirements

- Node.js 20+
- Docker for the local Cosmos DB emulator
- Azure Developer CLI and Azure CLI for deployment

## Develop the generator

```powershell
npm install
npm run validate
npm run dev -- --list
npm run dev -- my-agent --template agent-memory-ts --yes
```

After publishing, the equivalent command is:

```powershell
npx create-cosmos-agent my-agent --template agent-memory-ts
```

Other commands:

```powershell
npx create-cosmos-agent --list
npx create-cosmos-agent doctor
npx create-cosmos-agent validate
```

`doctor` and `validate` run in a generated project. `add` is a future capability.

## Architecture

The CLI composes a base from `src/bases/typescript/template`, ordered feature packs from
`src/features/*/template`, and `src/scenarios/agent-memory-ts.json`. Later feature packs can
overlay files without duplicating a complete template. The project manifest records the selected
capacity and local authentication mode.

The generated app uses:

- a singleton Cosmos client with `DefaultAzureCredential` in Azure;
- `/tenantId`, `/userId`, `/threadId` hierarchical partition keys;
- an immutable vector embedding policy and bounded, parameterized `VectorDistance` queries;
- application-owned memory and agent boundaries;
- OpenTelemetry API instrumentation and request-charge capture;
- separate identities for deployment and runtime, with Cosmos data-plane RBAC.

## Local and Azure paths

```powershell
cd my-agent
npm install
Copy-Item .env.example .env
docker compose up -d
npm run dev
```

The emulator vNext image is preview and may not support every Azure vector/HPK feature. The
in-memory security suite runs everywhere; set `RUN_COSMOS_INTEGRATION=true` only against a prepared
container. Deploy with `azd up`. No production account key is generated.

## Preview boundaries and troubleshooting

Microsoft Agent Framework and the Cosmos DB Agent Memory Toolkit do not currently provide a stable
TypeScript integration used by this sample. Their future integration belongs behind the generated
application-owned interfaces. The local Linux Cosmos emulator image is preview. If vector creation
fails, verify `EnableNoSQLVectorSearch`, use a new container, and validate hierarchical vector-search
support for the target account. Run `doctor` for static evidence and remediation.

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [SECURITY.md](./SECURITY.md).
