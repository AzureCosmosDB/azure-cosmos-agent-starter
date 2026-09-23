import { ConnectionMode, CosmosClient } from "@azure/cosmos";
import { DefaultAzureCredential } from "@azure/identity";

let singleton: CosmosClient | undefined;

export function getCosmosClient(): CosmosClient {
  if (singleton) return singleton;
  const endpoint = process.env.COSMOS_ENDPOINT;
  if (!endpoint) throw new Error("COSMOS_ENDPOINT is required.");
  if (process.env.COSMOS_EMULATOR === "true") {
    const key = process.env.COSMOS_EMULATOR_KEY;
    if (!key) throw new Error("COSMOS_EMULATOR_KEY is required only in emulator mode.");
    singleton = new CosmosClient({
      endpoint,
      key,
      connectionPolicy: { connectionMode: ConnectionMode.Gateway },
    });
  } else {
    singleton = new CosmosClient({
      endpoint,
      aadCredentials: new DefaultAzureCredential(),
      userAgentSuffix: "cosmos-agent-starter",
    });
  }
  return singleton;
}

export function getAgentStateContainer() {
  const database = process.env.COSMOS_DATABASE ?? "cosmos-agent";
  return getCosmosClient().database(database).container("agent-state");
}

export function getActionRequestsContainer() {
  const database = process.env.COSMOS_DATABASE ?? "cosmos-agent";
  return getCosmosClient().database(database).container("action-requests");
}
