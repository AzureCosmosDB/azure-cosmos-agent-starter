# Cosmos Agent Starter

`create-cosmos-agent` is an open-source, composable CLI for scaffolding secure Azure Cosmos DB
applications and AI agents. The first scenario is a strict TypeScript agent with durable,
tenant-safe memory, bounded vector retrieval, provenance citations, user deletion, diagnostics,
and an approval-gated consequential action.

## Requirements

- Node.js 20+
- Docker for the local Cosmos DB emulator
- Azure Developer CLI and Azure CLI for deployment

## Quickstart: run locally in five minutes

This quickstart uses the generated in-memory adapter first: no Azure subscription, Cosmos DB
account, Docker, or credentials are required.

### 1. Generate an agent project

```powershell
npx create-cosmos-agent my-cosmos-agent `
  --template agent-memory-ts `
  --yes `
  --no-git
```

If a corporate npm proxy has not mirrored the package yet, download the release tarball from
GitHub and ask `npx` to use that local package:

```powershell
$package = Join-Path $env:TEMP "create-cosmos-agent-0.1.1.tgz"

Invoke-WebRequest `
  -Uri "https://github.com/sajeetharan/cosmos-agent-starter/releases/download/v0.1.1/create-cosmos-agent-0.1.1.tgz" `
  -OutFile $package

npx --yes --package $package create-cosmos-agent my-cosmos-agent `
  --template agent-memory-ts `
  --yes `
  --no-git
```

### 2. Install and test the generated project

```powershell
cd my-cosmos-agent
npm install
npm run typecheck
npm test
```

### 3. Start the API without a database

```powershell
npm run dev
```

Development defaults to the in-memory backend. The API listens on `http://localhost:3000`; keep
it running and open another terminal.

### 4. Verify health

```powershell
Invoke-RestMethod http://localhost:3000/health
```

Expected response:

```json
{
  "status": "ok"
}
```

### 5. Store and recall a memory

```powershell
$headers = @{
  "x-tenant-id"      = "tenant-a"
  "x-user-id"        = "user-a"
  "x-correlation-id" = "quickstart-001"
}

$memory = @{
  type          = "preference"
  content       = "I prefer concise technical answers"
  threadId      = "thread-001"
  interactionId = "interaction-001"
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:3000/api/memories `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $memory

$recall = @{
  query = "How does the user prefer answers?"
  limit = 5
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:3000/api/memories/recall `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $recall
```

The recall response includes the scoped memory, similarity score, memory ID, and source
interaction citation.

### 6. Inspect and validate

```powershell
Invoke-RestMethod `
  -Uri http://localhost:3000/api/diagnostics `
  -Headers $headers

npx create-cosmos-agent doctor .
npx create-cosmos-agent validate .
```

### Move to Cosmos DB or Azure

After the in-memory path works:

1. Start Docker Desktop's Linux engine.
2. Configure `.env` from `.env.example` with the emulator endpoint and emulator key.
3. Run `docker compose up -d`.
4. Set `MEMORY_BACKEND=cosmos`.
5. Run the opt-in integration suite with `RUN_COSMOS_INTEGRATION=true`.

For Azure, sign in with Azure Developer CLI and deploy:

```powershell
azd auth login
azd up
```

Azure deployment can create billable resources. Production uses Managed Identity and Cosmos DB
data-plane RBAC; it does not generate a production account key.

Without `--yes`, the interactive flow asks for the destination, local mode, Azure capacity,
example web interface, and Git initialization. `--yes` accepts prompt defaults but **does not
permit overwriting files**; use `--force` separately and deliberately for a non-empty destination.

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
npm run dev
```

This starts with in-memory storage. To use Cosmos DB, set `MEMORY_BACKEND=cosmos` in `.env` and
configure either the emulator credentials or an Azure endpoint. Start the emulator with
`docker compose up -d` when using the local Cosmos path.

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
