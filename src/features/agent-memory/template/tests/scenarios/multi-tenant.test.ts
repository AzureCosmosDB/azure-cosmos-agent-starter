import { describe, expect, it } from "vitest";
import {
  InMemoryConversationStore,
  InMemoryMemoryStore,
} from "../../packages/memory/src/index.js";
import { InMemoryActionStore } from "../../packages/tools/src/index.js";

const tenantAUser = {
  tenantId: "tenant-a",
  userId: "user-a",
  roles: [],
  correlationId: "tenant-a-user",
};
const tenantAApprover = {
  ...tenantAUser,
  userId: "approver-a",
  correlationId: "tenant-a-approver",
};
const tenantBUser = {
  tenantId: "tenant-b",
  userId: "user-b",
  roles: [],
  correlationId: "tenant-b-user",
};

describe("multi-tenant agent scenario", () => {
  it("isolates conversation, durable memory, deletion, and approval flows", async () => {
    const conversations = new InMemoryConversationStore();
    const memories = new InMemoryMemoryStore();
    const actions = new InMemoryActionStore();

    await conversations.append({
      context: tenantAUser,
      threadId: "case-1",
      role: "user",
      content: "My account reference is private.",
    });
    expect(await conversations.list(tenantBUser, "case-1")).toEqual([]);

    const memory = await memories.remember({
      context: tenantAUser,
      threadId: "case-1",
      agentId: "support-agent",
      type: "preference",
      content: "Prefers email updates.",
      provenance: { interactionId: "interaction-1", messageId: "message-1" },
      confidence: 1,
      retentionClass: "long-term",
    });
    expect((await memories.recall({
      context: tenantAUser,
      query: "update preference",
      limit: 5,
    })).trace.selectedMemoryIds).toEqual([memory.id]);
    expect((await memories.recall({
      context: tenantBUser,
      query: "email",
      limit: 5,
    })).results).toEqual([]);
    await expect(memories.forget({
      context: tenantBUser,
      id: memory.id,
    })).rejects.toThrow(/scope/i);
    expect((await memories.list({ context: tenantAUser, limit: 10 })).items).toHaveLength(1);

    const action = actions.create(tenantAUser, "support-agent", {
      affectedUserId: tenantAApprover.userId,
      proposedAction: "release protected account summary",
      idempotencyKey: "scenario-action-1",
    });
    expect(() => actions.execute(tenantAApprover, action.id)).toThrow(/unapproved/i);
    expect(actions.decide(tenantAApprover, action.id, "approved").state).toBe("approved");
    expect(actions.execute(tenantAApprover, action.id).state).toBe("completed");

    await memories.forget({ context: tenantAUser, id: memory.id });
    expect((await memories.list({ context: tenantAUser, limit: 10 })).items).toEqual([]);
  });
});
