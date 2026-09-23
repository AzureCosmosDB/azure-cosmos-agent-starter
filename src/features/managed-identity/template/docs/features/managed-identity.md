# Managed Identity

Azure uses a user-assigned Managed Identity and Cosmos DB data-plane RBAC. Runtime code uses
`DefaultAzureCredential`; account keys are accepted only by the explicitly selected emulator path.
