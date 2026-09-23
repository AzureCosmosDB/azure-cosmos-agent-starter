import { describe, expect, it } from "vitest";
import { createAIProvider } from "../../packages/ai/src/index.js";
import { EventAgentService } from "../../packages/agent/src/index.js";
import { parseAgentEvent } from "../../packages/events/src/index.js";
import { InMemoryMemoryStore } from "../../packages/memory/src/index.js";
import { InMemoryActionStore } from "../../packages/tools/src/index.js";

const event = {
  id: "event-00000001",
  type: "mail.received",
  source: "gmail",
  tenantId: "tenant-a",
  subjectId: "user-a",
  occurredAt: "2026-09-23T12:00:00.000Z",
  data: {
    objective: "Summarize the new message.",
    threadId: "mailbox",
    proposedAction: "Send a reply",
    affectedUserId: "user-a",
  },
};

describe("event agent", () => {
  it("reuses memory and approval records when a trigger delivers the same event twice", async () => {
    const service = new EventAgentService(
      createAIProvider({ NODE_ENV: "test", AI_PROVIDER: "mock" }),
      new InMemoryMemoryStore(),
      new InMemoryActionStore(),
    );
    const first = await service.handle(parseAgentEvent(event));
    const duplicate = await service.handle(parseAgentEvent(event));
    expect(duplicate.memoryId).toBe(first.memoryId);
    expect(duplicate.actionRequestId).toBe(first.actionRequestId);
  });

  it("requires an affected user whenever an event proposes an action", () => {
    expect(() => parseAgentEvent({
      ...event,
      data: { ...event.data, affectedUserId: undefined },
    })).toThrow(/supplied together/i);
  });
});
