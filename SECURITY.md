# Security

Report vulnerabilities privately through the repository host's security advisory feature. Do not
include credentials, customer content, or production identifiers in reports.

Production uses Microsoft Entra ID, Managed Identity, and Cosmos DB data-plane RBAC. Account keys are
limited to explicit local emulator mode and must never be committed. Runtime tools are narrow domain
operations, not arbitrary Cosmos CRUD or query access. Tenant/user identity must come from authenticated
request context, never model-generated arguments. Consequential actions require affected-user evidence,
cannot be self-approved by the requesting agent, and execute idempotently only after approval.
