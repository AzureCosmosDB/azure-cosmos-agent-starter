import { describe, expect, it } from "vitest";
import { contextFromEvent, parseAgentEvent } from "../../packages/events/src/index.js";

describe("event tenant isolation", () => {
  it("derives tenant and user scope from the validated event envelope", () => {
    const event = parseAgentEvent({
      id: "event-00000001",
      type: "mail.received",
      source: "gmail",
      tenantId: "tenant-a",
      subjectId: "user-a",
      occurredAt: "2026-09-23T12:00:00.000Z",
      data: { objective: "Summarize the message.", threadId: "mailbox" },
    });
    expect(contextFromEvent(event)).toMatchObject({
      tenantId: "tenant-a",
      userId: "user-a",
      correlationId: "event-00000001",
    });
  });
});
