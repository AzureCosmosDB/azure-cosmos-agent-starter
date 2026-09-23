# {{PROJECT_NAME}}

Tenant-safe TypeScript agent memory on Azure Cosmos DB.

## Five-minute local path

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Development defaults to the in-memory adapter, so the API starts without Docker or Azure.
To use the emulator, run `docker compose up -d`, set `MEMORY_BACKEND=cosmos` and the emulator
credentials in `.env`, then restart the API.

The API expects trusted development headers `x-tenant-id` and `x-user-id`. Replace this development
adapter with verified Entra token claims before deployment. Never accept identity fields from agent tools.

## Azure deployment

Run `azd auth login`, set `AZURE_PRINCIPAL_ID` to the deployment identity object ID when it needs
data-plane access, and run `azd up`. Runtime uses a separate user-assigned Managed Identity and
`DefaultAzureCredential`; local-auth is disabled on the account. Serverless and autoscale are mutually
exclusive infrastructure paths.

## Data and memory lifecycle

`agent-state` stores `thread`, `message`, `memory`, and `toolCall` documents with the hierarchical key
`/tenantId`, `/userId`, `/threadId`. The order supports tenant and user prefix queries; it is an
opinionated example that must be validated against real access patterns, cardinality, hot partitions,
and scale. Memory includes provenance, confidence, correlation, optional expiry, agent/model/prompt
versions, and an embedding. Users can inspect and delete only their own memories.

Vector recall uses parameterized tenant/user filters, bounded `TOP N`, a partition-key prefix, cosine
distance, citations, and RU capture. The deterministic eight-dimensional embedding provider is only a
local/test adapter; replace it with your approved embedding deployment without changing the store contract.

`action-requests` records the audit lifecycle from pending through completion. The affected user must
approve, an agent cannot self-approve, and execution requires an idempotency key.

## Diagnostics and tests

The diagnostics endpoint reports operation counts, request charge, duration, and errors while redacting
prompt and document bodies. Run:

```powershell
npm run typecheck
npm test
npm run build
npm run test:integration
```

Set `RUN_COSMOS_INTEGRATION=true` only after a compatible emulator or Azure container is available.
The vNext Linux emulator is preview and vector/HPK parity can differ from Azure. Portable YAML evals
define the adapter boundary to the existing organizational evaluation framework; this project does not
invent a generic runner.

Adapt the sample by replacing the development identity adapter, embedding provider, and application-owned
agent SDK boundary while preserving context scoping, bounded queries, provenance, deletion, diagnostics,
approval evidence, and security tests.
