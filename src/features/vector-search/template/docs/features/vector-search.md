# Vector search

The `agent-state` container defines an immutable vector embedding policy and a quantized-flat index.
Recall always uses a bounded `TOP N`, parameterized embedding, tenant/user filters, and hierarchical
partition-key prefix. Azure Cosmos DB vector search and optimal HPK behavior can require account-level
feature enablement; validate this path in an Azure integration environment.
