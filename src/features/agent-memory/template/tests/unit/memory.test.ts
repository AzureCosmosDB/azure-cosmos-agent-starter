import { describe, expect, it } from "vitest";
import { InMemoryMemoryStore } from "../../packages/memory/src/index.js";

const context = { tenantId: "tenant-a", userId: "user-a", roles: [], correlationId: "correlation-1" };
describe("memory store", () => {
  it("stores, recalls, paginates, cites, and deletes memory", async () => {
    const store = new InMemoryMemoryStore();
    const memory = await store.remember({
      context, threadId: "thread-1", agentId: "agent-1", type: "preference",
      content: "Prefers email notifications", source: { interactionId: "interaction-1", messageId: "message-1" },
      confidence: 0.9,
    });
    const recalled = await store.recall({ context, query: "email notification preference", limit: 5 });
    expect(recalled[0]?.memory.id).toBe(memory.id);
    expect(recalled[0]?.citation).toEqual({
      memoryId: memory.id, interactionId: "interaction-1", messageId: "message-1",
    });
    const page = await store.list({ context, limit: 1 });
    expect(page.items).toHaveLength(1);
    await store.forget({ context, id: memory.id });
    expect((await store.list({ context, limit: 10 })).items).toHaveLength(0);
  });
});
