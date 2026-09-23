import { describe, it } from "vitest";
import { expect } from "vitest";
import {
  CosmosAgentMemoryStore,
  type AgentMemory,
} from "../../packages/memory/src/index.js";
import { getAgentStateContainer } from "../../packages/memory/src/cosmos-client.js";

const enabled = process.env.RUN_COSMOS_INTEGRATION === "true";
describe.skipIf(!enabled)("Cosmos emulator integration", () => {
  it("runs store/retrieve/vector/pagination/concurrency fixtures", async () => {
    const suffix = crypto.randomUUID();
    const context = {
      tenantId: `integration-${suffix}`,
      userId: "user",
      roles: [],
      correlationId: suffix,
    };
    const store = new CosmosAgentMemoryStore();
    const memory = await store.remember({
      context,
      threadId: "thread",
      agentId: "integration-agent",
      type: "fact",
      content: "The integration fixture prefers concise answers.",
      source: { interactionId: suffix },
      confidence: 1,
    });
    try {
      expect((await store.list({ context, limit: 1 })).items[0]?.id).toBe(memory.id);
      expect((await store.recall({ context, query: "concise response preference", limit: 3 }))[0]?.citation.memoryId)
        .toBe(memory.id);

      const item = getAgentStateContainer().item(memory.id, [
        context.tenantId,
        context.userId,
        memory.threadId,
      ]);
      const read = await item.read<AgentMemory & { _etag: string }>();
      const stale = read.resource;
      if (!stale?._etag) throw new Error("Cosmos response did not include an ETag.");
      await item.replace(
        { ...stale, confidence: 0.9 },
        { accessCondition: { type: "IfMatch", condition: stale._etag } },
      );
      await expect(
        item.replace(
          { ...stale, confidence: 0.8 },
          { accessCondition: { type: "IfMatch", condition: stale._etag } },
        ),
      ).rejects.toMatchObject({ code: 412 });
    } finally {
      await store.forget({ context, id: memory.id });
    }
  });
});
