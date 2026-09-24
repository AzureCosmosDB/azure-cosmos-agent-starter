# Emulator

The Docker Compose image is the vNext Linux emulator preview. Emulator feature parity, especially
vector indexing and hierarchical partition keys, can lag Azure. Run tenant and approval tests locally,
then opt in to Azure integration tests for vector-policy validation.

After the emulator is healthy, run `npm run emulator:init`. Initialization creates separate
`conversation-history`, `agent-memory`, `application-data`, and `action-requests` containers with the
same partition keys and TTL defaults as the Bicep deployment.
