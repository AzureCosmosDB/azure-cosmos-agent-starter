import { z } from "zod";
import type { RequestContext } from "../../auth/src/index.js";

export const agentEventSchema = z.object({
  id: z.string().trim().min(8).max(256),
  type: z.string().trim().min(1).max(128),
  source: z.string().trim().min(1).max(256),
  tenantId: z.string().trim().min(1).max(128),
  subjectId: z.string().trim().min(1).max(128),
  occurredAt: z.iso.datetime(),
  data: z.object({
    objective: z.string().trim().min(1).max(20_000),
    threadId: z.string().trim().min(1).max(128).default("events"),
    proposedAction: z.string().trim().min(1).max(10_000).optional(),
    affectedUserId: z.string().trim().min(1).max(128).optional(),
  }).refine(
    (data) => Boolean(data.proposedAction) === Boolean(data.affectedUserId),
    "proposedAction and affectedUserId must be supplied together.",
  ),
});

export type AgentEvent = z.infer<typeof agentEventSchema>;

export function parseAgentEvent(input: unknown): AgentEvent {
  return agentEventSchema.parse(input);
}

export function contextFromEvent(event: AgentEvent): RequestContext {
  return {
    tenantId: event.tenantId,
    userId: event.subjectId,
    roles: ["event-trigger"],
    correlationId: event.id,
  };
}
