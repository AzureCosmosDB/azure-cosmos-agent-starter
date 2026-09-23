# Cosmos Agent project instructions

- Never generate production account-key authentication. Use `DefaultAzureCredential` outside emulator mode.
- Derive tenant and user identity from trusted `RequestContext`; ignore model-generated identity fields.
- Scope user-data queries to the tenant/user hierarchical partition-key prefix.
- Parameterize queries. Use bounded `TOP N` and continuation-token pagination; never use unbounded `fetchAll`.
- Capture Cosmos request charges and operation duration without recording sensitive document bodies.
- Use ETags for conflicting updates and idempotency keys for consequential actions.
- Every durable memory requires provenance and must support user inspection and deletion.
- An agent cannot approve its own action; an unapproved action cannot execute.
- Review serverless and autoscale infrastructure separately; serverless must not provision throughput.
