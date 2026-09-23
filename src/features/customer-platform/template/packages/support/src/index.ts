import type { Container, SqlQuerySpec } from "@azure/cosmos";
import type { RequestContext } from "../../auth/src/index.js";
import { getAgentStateContainer } from "../../memory/src/cosmos-client.js";

export type TicketStatus = "open" | "in-progress" | "waiting-on-customer" | "resolved";
export type TicketPriority = "low" | "normal" | "high" | "urgent";

export interface SupportTicket {
  id: string;
  documentType: "supportTicket";
  schemaVersion: 1;
  tenantId: string;
  userId: string;
  threadId: string;
  subject: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTicketInput {
  subject: string;
  description: string;
  priority: TicketPriority;
}

export interface SupportStore {
  create(context: RequestContext, input: CreateTicketInput): Promise<SupportTicket>;
  list(context: RequestContext): Promise<SupportTicket[]>;
  updateStatus(context: RequestContext, id: string, status: TicketStatus): Promise<SupportTicket>;
}

function newTicket(context: RequestContext, input: CreateTicketInput): SupportTicket {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  return {
    id,
    documentType: "supportTicket",
    schemaVersion: 1,
    tenantId: context.tenantId,
    userId: context.userId,
    threadId: id,
    subject: input.subject,
    description: input.description,
    priority: input.priority,
    status: "open",
    createdAt: now,
    updatedAt: now,
  };
}

export class InMemorySupportStore implements SupportStore {
  private readonly tickets = new Map<string, SupportTicket>();

  async create(context: RequestContext, input: CreateTicketInput): Promise<SupportTicket> {
    const ticket = newTicket(context, input);
    this.tickets.set(ticket.id, ticket);
    return ticket;
  }

  async list(context: RequestContext): Promise<SupportTicket[]> {
    return [...this.tickets.values()]
      .filter((ticket) => ticket.tenantId === context.tenantId && ticket.userId === context.userId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async updateStatus(context: RequestContext, id: string, status: TicketStatus): Promise<SupportTicket> {
    const ticket = this.tickets.get(id);
    if (!ticket || ticket.tenantId !== context.tenantId || ticket.userId !== context.userId) {
      throw new Error("Support ticket not found in the authenticated user scope.");
    }
    const updated = { ...ticket, status, updatedAt: new Date().toISOString() };
    this.tickets.set(id, updated);
    return updated;
  }
}

export class CosmosSupportStore implements SupportStore {
  constructor(private readonly container: Container = getAgentStateContainer()) {}

  async create(context: RequestContext, input: CreateTicketInput): Promise<SupportTicket> {
    const ticket = newTicket(context, input);
    const response = await this.container.items.create(ticket);
    return response.resource ?? ticket;
  }

  async list(context: RequestContext): Promise<SupportTicket[]> {
    const query: SqlQuerySpec = {
      query: `SELECT TOP 100 * FROM c
        WHERE c.documentType = @documentType
          AND c.tenantId = @tenantId
          AND c.userId = @userId
        ORDER BY c.createdAt DESC`,
      parameters: [
        { name: "@documentType", value: "supportTicket" },
        { name: "@tenantId", value: context.tenantId },
        { name: "@userId", value: context.userId },
      ],
    };
    const response = await this.container.items.query<SupportTicket>(query, {
      maxItemCount: 100,
      partitionKey: [context.tenantId, context.userId],
    }).fetchNext();
    return response.resources;
  }

  async updateStatus(context: RequestContext, id: string, status: TicketStatus): Promise<SupportTicket> {
    const item = this.container.item(id, [context.tenantId, context.userId, id]);
    const response = await item.read<SupportTicket & { _etag: string }>();
    if (!response.resource) throw new Error("Support ticket not found in the authenticated user scope.");
    const updated: SupportTicket = {
      ...response.resource,
      status,
      updatedAt: new Date().toISOString(),
    };
    const replaced = await item.replace(updated, {
      accessCondition: { type: "IfMatch", condition: response.resource._etag },
    });
    if (!replaced.resource) throw new Error("Support ticket status was not persisted.");
    return replaced.resource as SupportTicket;
  }
}
