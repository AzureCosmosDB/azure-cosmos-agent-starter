import "dotenv/config";
import {
  ConnectionMode,
  CosmosClient,
  PartitionKeyDefinitionVersion,
  PartitionKeyKind,
  VectorEmbeddingDataType,
  VectorEmbeddingDistanceFunction,
  VectorIndexType,
} from "@azure/cosmos";

if (process.env.COSMOS_EMULATOR !== "true") {
  throw new Error("Emulator initialization requires COSMOS_EMULATOR=true.");
}

const endpoint = process.env.COSMOS_ENDPOINT?.trim();
const key = process.env.COSMOS_EMULATOR_KEY?.trim();
const databaseId = process.env.COSMOS_DATABASE?.trim() || "cosmos-agent";
if (!endpoint) throw new Error("COSMOS_ENDPOINT is required.");
if (!key) throw new Error("COSMOS_EMULATOR_KEY is required.");

const client = new CosmosClient({
  endpoint,
  key,
  connectionPolicy: { connectionMode: ConnectionMode.Gateway },
});
const { database } = await client.databases.createIfNotExists({ id: databaseId });
await database.containers.createIfNotExists({
  id: "conversation-history",
  partitionKey: {
    paths: ["/tenantId", "/userId", "/threadId"],
    kind: PartitionKeyKind.MultiHash,
    version: PartitionKeyDefinitionVersion.V2,
  },
  defaultTtl: 2_592_000,
});
await database.containers.createIfNotExists({
  id: "agent-memory",
  partitionKey: {
    paths: ["/tenantId", "/userId"],
    kind: PartitionKeyKind.MultiHash,
    version: PartitionKeyDefinitionVersion.V2,
  },
  defaultTtl: 7_776_000,
  vectorEmbeddingPolicy: {
    vectorEmbeddings: [{
      path: "/embedding",
      dataType: VectorEmbeddingDataType.Float32,
      distanceFunction: VectorEmbeddingDistanceFunction.Cosine,
      dimensions: 8,
    }],
  },
  indexingPolicy: {
    includedPaths: [{ path: "/*" }],
    excludedPaths: [{ path: "/embedding/*" }],
    vectorIndexes: [{ path: "/embedding", type: VectorIndexType.QuantizedFlat }],
  },
});
await database.containers.createIfNotExists({
  id: "action-requests",
  partitionKey: {
    paths: ["/tenantId", "/affectedUserId"],
    kind: PartitionKeyKind.MultiHash,
    version: PartitionKeyDefinitionVersion.V2,
  },
  defaultTtl: -1,
});
await database.containers.createIfNotExists({
  id: "application-data",
  partitionKey: {
    paths: ["/tenantId", "/userId"],
    kind: PartitionKeyKind.MultiHash,
    version: PartitionKeyDefinitionVersion.V2,
  },
  vectorEmbeddingPolicy: {
    vectorEmbeddings: [{
      path: "/embedding",
      dataType: VectorEmbeddingDataType.Float32,
      distanceFunction: VectorEmbeddingDistanceFunction.Cosine,
      dimensions: 8,
    }],
  },
  indexingPolicy: {
    includedPaths: [{ path: "/*" }],
    excludedPaths: [{ path: "/embedding/*" }],
    vectorIndexes: [{ path: "/embedding", type: VectorIndexType.QuantizedFlat }],
  },
});

console.log(`Cosmos DB emulator initialized: ${databaseId}`);
