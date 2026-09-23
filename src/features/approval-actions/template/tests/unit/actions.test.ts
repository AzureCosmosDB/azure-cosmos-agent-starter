import { describe, expect, it } from "vitest";
import { InMemoryActionStore } from "../../packages/tools/src/index.js";

const context = { tenantId: "tenant-a", userId: "user-a", roles: [], correlationId: "c1" };
describe("approval actions", () => {
  it("is idempotent and executes only after affected-user approval", () => {
    const store = new InMemoryActionStore();
    const input = { affectedUserId: "user-a", proposedAction: "release protected result", idempotencyKey: "request-0001" };
    const first = store.create(context, "agent-1", input);
    expect(store.create(context, "agent-1", input).id).toBe(first.id);
    expect(() => store.execute(context, first.id)).toThrow(/unapproved/i);
    store.decide(context, first.id, "approved");
    expect(store.execute(context, first.id).state).toBe("completed");
  });
});
