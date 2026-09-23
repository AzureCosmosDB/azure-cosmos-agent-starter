import type { RequestContext } from "../../auth/src/index.js";
import type { Container } from "@azure/cosmos";
import { createHash } from "node:crypto";
import { getActionRequestsContainer } from "../../memory/src/cosmos-client.js";

export type ActionState = "pending" | "approved" | "rejected" | "executing" | "completed" | "failed" | "expired";
export interface ActionRequest {
  id: string; tenantId: string; initiatingUserId: string; requestingAgentId: string;
  affectedUserId: string; proposedAction: string; state: ActionState; idempotencyKey: string;
  approvalEvidence?: { userId: string; decidedAt: string; correlationId: string };
  executionResult?: string; createdAt: string; updatedAt: string;
}
export interface CreateActionInput { affectedUserId: string; proposedAction: string; idempotencyKey: string }

function actionId(context: RequestContext, input: CreateActionInput): string {
  const scope = `${context.tenantId}:${input.affectedUserId}:${input.idempotencyKey}`;
  return `action-${createHash("sha256").update(scope).digest("hex")}`;
}

function isConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null &&
    ("code" in error && error.code === 409 || "statusCode" in error && error.statusCode === 409);
}

export class InMemoryActionStore {
  private readonly actions = new Map<string, ActionRequest>();
  private readonly idempotency = new Map<string, string>();
  create(context: RequestContext, requestingAgentId: string, input: CreateActionInput): ActionRequest {
    const scopeKey = `${context.tenantId}:${input.idempotencyKey}`;
    const existingId = this.idempotency.get(scopeKey);
    if (existingId) return this.actions.get(existingId)!;
    const now = new Date().toISOString();
    const action: ActionRequest = {
      id: actionId(context, input), tenantId: context.tenantId, initiatingUserId: context.userId,
      requestingAgentId, affectedUserId: input.affectedUserId, proposedAction: input.proposedAction,
      state: "pending", idempotencyKey: input.idempotencyKey, createdAt: now, updatedAt: now,
    };
    this.actions.set(action.id, action);
    this.idempotency.set(scopeKey, action.id);
    return action;
  }

  decide(context: RequestContext, id: string, decision: "approved" | "rejected"): ActionRequest {
    const action = this.actions.get(id);
    if (!action || action.tenantId !== context.tenantId) throw new Error("Action request not found.");
    if (context.userId === action.requestingAgentId) throw new Error("An agent cannot approve its own action.");
    if (context.userId !== action.affectedUserId) throw new Error("Only the affected user can decide this action.");
    if (action.state !== "pending") throw new Error("Only pending actions can be decided.");
    action.state = decision;
    action.updatedAt = new Date().toISOString();
    action.approvalEvidence = { userId: context.userId, decidedAt: action.updatedAt, correlationId: context.correlationId };
    return action;
  }
  execute(context: RequestContext, id: string): ActionRequest {
    const action = this.actions.get(id);
    if (!action || action.tenantId !== context.tenantId) throw new Error("Action request not found.");
    if (action.state !== "approved" || !action.approvalEvidence) throw new Error("An unapproved action cannot execute.");
    action.state = "executing";
    action.updatedAt = new Date().toISOString();
    action.executionResult = "Protected result released to the affected user.";
    action.state = "completed";
    return action;
  }
  get(context: RequestContext, id: string): ActionRequest {
    const action = this.actions.get(id);
    if (!action || action.tenantId !== context.tenantId) throw new Error("Action request not found.");
    return action;
  }
}

export class CosmosActionStore {
  constructor(private readonly container: Container = getActionRequestsContainer()) {}
  async create(
    context: RequestContext,
    requestingAgentId: string,
    input: CreateActionInput,
  ): Promise<ActionRequest> {
    const now = new Date().toISOString();
    const action: ActionRequest = {
      id: actionId(context, input), tenantId: context.tenantId, initiatingUserId: context.userId,
      requestingAgentId, affectedUserId: input.affectedUserId, proposedAction: input.proposedAction,
      state: "pending", idempotencyKey: input.idempotencyKey, createdAt: now, updatedAt: now,
    };
    try {
      const response = await this.container.items.create(action, {
        accessCondition: { type: "IfNoneMatch", condition: "*" },
      });
      return response.resource ?? action;
    } catch (error) {
      if (!isConflict(error)) throw error;
      const existing = await this.container
        .item(action.id, [context.tenantId, input.affectedUserId])
        .read<ActionRequest>();
      if (!existing.resource) throw new Error("Idempotent action write conflicted but no existing action was found.");
      return existing.resource;
    }
  }
  async decide(
    context: RequestContext,
    id: string,
    decision: "approved" | "rejected",
  ): Promise<ActionRequest> {
    const item = this.container.item(id, [context.tenantId, context.userId]);
    const response = await item.read<ActionRequest & { _etag: string }>();
    const action = response.resource;
    if (!action) throw new Error("Action request not found.");
    if (context.userId === action.requestingAgentId) throw new Error("An agent cannot approve its own action.");
    if (context.userId !== action.affectedUserId) throw new Error("Only the affected user can decide this action.");
    if (action.state !== "pending") throw new Error("Only pending actions can be decided.");
    const updated: ActionRequest = {
      ...action, state: decision, updatedAt: new Date().toISOString(),
      approvalEvidence: {
        userId: context.userId, decidedAt: new Date().toISOString(),
        correlationId: context.correlationId,
      },
    };
    const replaced = await item.replace(updated, {
      accessCondition: { type: "IfMatch", condition: action._etag },
    });
    if (!replaced.resource) throw new Error("Action decision was not persisted.");
    return replaced.resource as ActionRequest;
  }
  async execute(context: RequestContext, id: string): Promise<ActionRequest> {
    const item = this.container.item(id, [context.tenantId, context.userId]);
    const response = await item.read<ActionRequest & { _etag: string }>();
    const action = response.resource;
    if (!action) throw new Error("Action request not found.");
    if (action.state !== "approved" || !action.approvalEvidence) {
      throw new Error("An unapproved action cannot execute.");
    }
    const updated: ActionRequest = {
      ...action, state: "completed",
      executionResult: "Protected result released to the affected user.",
      updatedAt: new Date().toISOString(),
    };
    const replaced = await item.replace(updated, {
      accessCondition: { type: "IfMatch", condition: action._etag },
    });
    if (!replaced.resource) throw new Error("Action execution was not persisted.");
    return replaced.resource as ActionRequest;
  }
  async get(context: RequestContext, id: string): Promise<ActionRequest> {
    const response = await this.container.item(id, [context.tenantId, context.userId]).read<ActionRequest>();
    if (!response.resource) throw new Error("Action request not found.");
    return response.resource;
  }
}
