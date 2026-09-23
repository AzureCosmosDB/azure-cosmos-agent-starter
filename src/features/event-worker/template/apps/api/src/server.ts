import "dotenv/config";
import { createInterface } from "node:readline";
import { DefaultAzureCredential } from "@azure/identity";
import {
  ServiceBusClient,
  type ProcessErrorArgs,
  type ServiceBusReceivedMessage,
  type ServiceBusReceiver,
} from "@azure/service-bus";
import { createAIProvider } from "../../../packages/ai/src/index.js";
import { EventAgentService } from "../../../packages/agent/src/index.js";
import { parseAgentEvent } from "../../../packages/events/src/index.js";
import {
  CosmosAgentMemoryStore,
  InMemoryMemoryStore,
  resolveMemoryBackend,
} from "../../../packages/memory/src/index.js";
import {
  CosmosActionStore,
  InMemoryActionStore,
} from "../../../packages/tools/src/index.js";

const useInMemory = resolveMemoryBackend(process.env) === "in-memory";
const agent = new EventAgentService(
  createAIProvider(process.env),
  useInMemory ? new InMemoryMemoryStore() : new CosmosAgentMemoryStore(),
  useInMemory ? new InMemoryActionStore() : new CosmosActionStore(),
);

async function handle(input: unknown): Promise<void> {
  const result = await agent.handle(parseAgentEvent(input));
  console.log(JSON.stringify({ status: "completed", ...result }));
}

async function runStdin(): Promise<void> {
  console.log("Event worker ready. Send one JSON event per line.");
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    await handle(JSON.parse(line) as unknown);
  }
}

async function runServiceBus(): Promise<void> {
  const namespace = process.env.SERVICE_BUS_NAMESPACE?.trim();
  const queue = process.env.SERVICE_BUS_QUEUE?.trim() || "agent-events";
  if (!namespace) throw new Error("SERVICE_BUS_NAMESPACE is required when EVENT_TRANSPORT=service-bus.");
  const client = new ServiceBusClient(namespace, new DefaultAzureCredential());
  const receiver = client.createReceiver(queue, { receiveMode: "peekLock" });
  const processMessage = async (message: ServiceBusReceivedMessage): Promise<void> => {
    try {
      await handle(message.body);
      await receiver.completeMessage(message);
    } catch (error) {
      console.error(`Event ${message.messageId} failed and will be retried.`, error);
      await receiver.abandonMessage(message);
    }
  };
  const processError = async (args: ProcessErrorArgs): Promise<void> => {
    console.error("Service Bus processing error", args.error);
  };
  receiver.subscribe({ processMessage, processError }, { autoCompleteMessages: false });
  console.log(`Event worker listening on ${namespace}/${queue}.`);
  await waitForShutdown(receiver, client);
}

async function waitForShutdown(receiver: ServiceBusReceiver, client: ServiceBusClient): Promise<void> {
  await new Promise<void>((resolve) => {
    const stop = () => resolve();
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
  await receiver.close();
  await client.close();
}

const transport = process.env.EVENT_TRANSPORT?.trim() || "stdin";
if (transport === "stdin") {
  await runStdin();
} else if (transport === "service-bus") {
  await runServiceBus();
} else {
  throw new Error('EVENT_TRANSPORT must be either "stdin" or "service-bus".');
}
