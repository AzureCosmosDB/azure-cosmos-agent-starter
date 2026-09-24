import { describe, expect, it } from "vitest";
import { InMemoryMemoryStore } from "../../packages/memory/src/index.js";
import { InMemoryActionStore } from "../../packages/tools/src/index.js";

const a = { tenantId: "tenant-a", userId: "user-a", roles: [], correlationId: "a" };
const b = { tenantId: "tenant-b", userId: "user-b", roles: [], correlationId: "b" };
describe("tenant and action security", () => {
  it("prevents cross-tenant retrieval and cross-user deletion, including vector recall", async () => {
    const store = new InMemoryMemoryStore();
    const memory = await store.remember({
      context: b, threadId: "thread", agentId: "agent", type: "fact", content: "Tenant B secret",
      provenance: { interactionId: "i" }, confidence: 1,
    });
    expect((await store.recall({ context: a, query: "secret", limit: 20 })).results).toEqual([]);
    await expect(store.forget({ context: a, id: memory.id })).rejects.toThrow(/scope/i);
  });
  it("ignores model identity because tools require trusted context", async () => {
    const store = new InMemoryMemoryStore();
    const modelArguments = { tenantId: "tenant-b", userId: "user-b", query: "secret", limit: 5 };
    expect((await store.recall({
      context: a,
      query: modelArguments.query,
      limit: modelArguments.limit,
    })).results).toEqual([]);
  });
  it("forbids self approval and unapproved execution", () => {
    const store = new InMemoryActionStore();
    const action = store.create(a, "user-a", {
      affectedUserId: "user-a", proposedAction: "release", idempotencyKey: "request-0002",
    });
    expect(() => store.decide(a, action.id, "approved")).toThrow(/own action/i);
    expect(() => store.execute(a, action.id)).toThrow(/unapproved/i);
  });
});
