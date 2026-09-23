# Cosmos Agent Starter

`create-cosmos-agent` is an open-source, composable CLI for scaffolding secure Azure Cosmos DB
applications and AI agents. The first scenario is a strict TypeScript agent with durable,
tenant-safe memory, bounded vector retrieval, provenance citations, user deletion, diagnostics,
and an approval-gated consequential action.

## Requirements

- Node.js 20+
- Docker for the local Cosmos DB emulator
- Azure Developer CLI and Azure CLI for deployment

## Quick start

Create the flagship TypeScript agent project:

```powershell
npx create-cosmos-agent my-agent --template agent-memory-ts
```

The interactive flow asks for:

1. Project destination
2. Local development mode (`emulator` or `azure`)
3. Azure capacity (`serverless` or `autoscale`)
4. Whether to include the example web interface
5. Whether to initialize Git

For CI, scripts, or users who already know the defaults:

```powershell
npx create-cosmos-agent my-agent --yes
```

`--yes` accepts prompt defaults but **does not permit overwriting files**. Use `--force`
separately and deliberately when generating into a non-empty destination.

## CLI reference

```text
create-cosmos-agent [create] <destination> [options]
create-cosmos-agent list [--json]
create-cosmos-agent doctor [project] [--json]
create-cosmos-agent validate [project] [--json]
```

### Commands

| Command | Purpose |
|---|---|
| `create [destination]` | Create a project. `create` is optional and is the default command. |
| `list` | List available scenario templates. Alias: `--list`, `-l`. |
| `doctor [project]` | Statically inspect a generated project and report evidence and remediation. |
| `validate [project]` | Run generated-file checks, type checking, build, unit/security/cost tests, and Bicep compilation when available. |

### Creation options

| Option | Description | Default |
|---|---|---|
| `-t, --template <id>` | Scenario template | `agent-memory-ts` |
| `--local <mode>` | Local authentication/runtime mode: `emulator` or `azure` | `emulator` |
| `--capacity <model>` | Azure Cosmos DB capacity: `serverless` or `autoscale` | `serverless` |
| `--web`, `--no-web` | Include or exclude the small example web interface | Included |
| `--git`, `--no-git` | Initialize or skip a Git repository in the generated project | Initialize |
| `-y, --yes` | Accept interactive defaults; required for ordinary JSON creation | Off |
| `-f, --force` | Allow generated files to overwrite matching paths in a non-empty destination | Off |
| `--dry-run` | Resolve and print the generation plan without writing files | Off |

`--force` overlays generated files; it does not delete unrelated files already in the destination.
`--force` and `--dry-run` cannot be combined.

### General options

| Option | Description |
|---|---|
| `-C, --project <path>` | Target project for `doctor` or `validate` |
| `--json` | Emit stable machine-readable output for automation |
| `-h, --help` | Show complete command help |
| `-v, --version` | Show the CLI version |

Long value options support both forms, such as `--capacity autoscale` and
`--capacity=autoscale`. Unknown flags, missing values, invalid enums, conflicting modes, and
multiple destinations return a nonzero exit code with a specific error.

### Examples

Interactive creation:

```powershell
npx create-cosmos-agent my-agent
```

Explicit production-oriented choices:

```powershell
npx create-cosmos-agent create my-agent `
  --template agent-memory-ts `
  --local azure `
  --capacity autoscale `
  --no-web `
  --yes
```

Preview a plan without writing:

```powershell
npx create-cosmos-agent my-agent --capacity autoscale --dry-run
npx create-cosmos-agent my-agent --capacity autoscale --dry-run --json
```

Generate from automation and parse the result:

```powershell
npx create-cosmos-agent my-agent --yes --no-git --json
```

Inspect or validate a project without changing the current directory:

```powershell
npx create-cosmos-agent doctor .\my-agent
npx create-cosmos-agent doctor -C .\my-agent --json
npx create-cosmos-agent validate .\my-agent
npx create-cosmos-agent validate -C .\my-agent --json
```

List templates or inspect CLI metadata:

```powershell
npx create-cosmos-agent list
npx create-cosmos-agent --list --json
npx create-cosmos-agent --help
npx create-cosmos-agent --version
```

### Exit codes and JSON

- Exit code `0`: the command completed successfully.
- Exit code `1`: parsing, generation, doctor, or validation failed.
- `doctor` returns `1` when it finds an error-level issue; warnings alone do not fail it.
- JSON errors use `{ "status": "error", "message": "..." }` on standard error.
- JSON creation requires a destination and either `--yes` or `--dry-run`, ensuring it never
  opens interactive prompts in automation.

## Develop the generator

```powershell
npm install
npm run validate
npm run dev -- --list
npm run dev -- my-agent --template agent-memory-ts --yes
```

`add` remains a future capability.

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

## Product inspiration

The single-command scaffolding experience is inspired by
[`christopheranderson/create-cosmosdb`](https://github.com/christopheranderson/create-cosmosdb).
Cosmos Agent Starter is a clean implementation with a composable feature architecture and a
different production security model; no upstream source code is copied. In particular, generated
Azure deployments use Managed Identity rather than production Cosmos DB account keys.
