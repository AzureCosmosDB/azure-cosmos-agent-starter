import type { Container, FeedOptions, QueryIterator, SqlQuerySpec } from "@azure/cosmos";
import type { RequestContext } from "../../auth/src/index.js";
import { MAX_PAGE_SIZE, type Page } from "../../shared/src/index.js";
import { telemetry } from "../../telemetry/src/index.js";
import { getAgentStateContainer } from "./cosmos-client.js";

export type MemoryType = "preference" | "fact" | "summary" | "event";
export interface AgentMemory {
  id: string;
  documentType: "memory";
  schemaVersion: 1;
  tenantId: string;
  userId: string;
  threadId: string;
  agentId: string;
  type: MemoryType;
  content: string;
  embedding?: number[];
  source: { interactionId: string; messageId?: string; toolCallId?: string };
  confidence: number;
  createdAt: string;
  expiresAt?: string;
  correlationId: string;
  modelVersion?: string;
  promptVersion?: string;
}
export interface MemoryResult {
  memory: AgentMemory;
  similarityScore: number;
  citation: { memoryId: string; interactionId: string; messageId?: string };
}
interface Scoped { context: RequestContext }
export interface RememberInput extends Scoped {
  threadId: string; agentId: string; type: MemoryType; content: string;
  source: AgentMemory["source"]; confidence: number; expiresAt?: string;
  modelVersion?: string; promptVersion?: string;
}
export interface RecallInput extends Scoped { query: string; limit: number; threadId?: string }
export interface ForgetInput extends Scoped { id: string }
export interface ListMemoryInput extends Scoped { limit: number; continuationToken?: string }
export interface AgentMemoryStore {
  remember(input: RememberInput): Promise<AgentMemory>;
  recall(input: RecallInput): Promise<MemoryResult[]>;
  forget(input: ForgetInput): Promise<void>;
  list(input: ListMemoryInput): Promise<Page<AgentMemory>>;
}

export interface EmbeddingProvider { embed(text: string): Promise<number[]> }
export class DeterministicEmbeddingProvider implements EmbeddingProvider {
  async embed(text: string): Promise<number[]> {
    const vector = Array.from({ length: 8 }, (_, index) => {
      let value = 0;
      for (let offset = index; offset < text.length; offset += 8) value += text.charCodeAt(offset) ?? 0;
      return value;
    });
    const magnitude = Math.hypot(...vector) || 1;
    return vector.map((value) => value / magnitude);
  }
}

function citation(memory: AgentMemory): MemoryResult["citation"] {
  return {
    memoryId: memory.id,
    interactionId: memory.source.interactionId,
    ...(memory.source.messageId ? { messageId: memory.source.messageId } : {}),
  };
}
function cosine(left: number[], right: number[]): number {
  const dot = left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);
  return dot / ((Math.hypot(...left) || 1) * (Math.hypot(...right) || 1));
}

export class InMemoryMemoryStore implements AgentMemoryStore {
  private readonly items = new Map<string, AgentMemory>();
  constructor(private readonly embeddings: EmbeddingProvider = new DeterministicEmbeddingProvider()) {}
  async remember(input: RememberInput): Promise<AgentMemory> {
    const memory: AgentMemory = {
      id: crypto.randomUUID(), documentType: "memory", schemaVersion: 1,
      tenantId: input.context.tenantId, userId: input.context.userId, threadId: input.threadId,
      agentId: input.agentId, type: input.type, content: input.content,
      embedding: await this.embeddings.embed(input.content), source: input.source,
      confidence: input.confidence, createdAt: new Date().toISOString(),
      correlationId: input.context.correlationId,
      ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      ...(input.modelVersion ? { modelVersion: input.modelVersion } : {}),
      ...(input.promptVersion ? { promptVersion: input.promptVersion } : {}),
    };
    this.items.set(memory.id, memory);
    telemetry.cosmos("create", 1, 0, input.context.correlationId);
    return memory;
  }
  async recall(input: RecallInput): Promise<MemoryResult[]> {
    const limit = Math.min(Math.max(input.limit, 1), 20);
    const query = await this.embeddings.embed(input.query);
    return [...this.items.values()]
      .filter((memory) => memory.tenantId === input.context.tenantId && memory.userId === input.context.userId)
      .filter((memory) => !input.threadId || memory.threadId === input.threadId)
      .map((memory) => ({ memory, similarityScore: cosine(memory.embedding ?? [], query), citation: citation(memory) }))
      .sort((a, b) => b.similarityScore - a.similarityScore)
      .slice(0, limit);
  }
  async forget(input: ForgetInput): Promise<void> {
    const memory = this.items.get(input.id);
    if (!memory || memory.tenantId !== input.context.tenantId || memory.userId !== input.context.userId) {
      throw new Error("Memory not found in the authenticated user scope.");
    }
    this.items.delete(input.id);
  }
  async list(input: ListMemoryInput): Promise<Page<AgentMemory>> {
    const limit = Math.min(Math.max(input.limit, 1), MAX_PAGE_SIZE);
    const offset = input.continuationToken ? Number.parseInt(input.continuationToken, 10) : 0;
    const scoped = [...this.items.values()].filter(
      (memory) => memory.tenantId === input.context.tenantId && memory.userId === input.context.userId,
    );
    const items = scoped.slice(offset, offset + limit);
    const next = offset + items.length;
    return { items, ...(next < scoped.length ? { continuationToken: String(next) } : {}), requestCharge: 0 };
  }
}

async function firstPage<T>(iterator: QueryIterator<T>) {
  for await (const page of iterator.getAsyncIterator()) return page;
  return { resources: [] as T[], requestCharge: 0, continuationToken: undefined };
}

export class CosmosAgentMemoryStore implements AgentMemoryStore {
  constructor(
    private readonly container: Container = getAgentStateContainer(),
    private readonly embeddings: EmbeddingProvider = new DeterministicEmbeddingProvider(),
  ) {}
  async remember(input: RememberInput): Promise<AgentMemory> {
    const memory = await new InMemoryMemoryStore(this.embeddings).remember(input);
    const started = performance.now();
    const response = await this.container.items.create(memory);
    telemetry.cosmos("create", response.requestCharge, performance.now() - started, input.context.correlationId);
    return response.resource ?? memory;
  }
  async recall(input: RecallInput): Promise<MemoryResult[]> {
    const limit = Math.min(Math.max(Math.trunc(input.limit), 1), 20);
    const embedding = await this.embeddings.embed(input.query);
    const query: SqlQuerySpec = {
      query: `SELECT TOP ${limit} c, VectorDistance(c.embedding, @embedding) AS similarityScore
        FROM c WHERE c.documentType = @documentType AND c.tenantId = @tenantId AND c.userId = @userId
        ORDER BY VectorDistance(c.embedding, @embedding)`,
      parameters: [
        { name: "@embedding", value: embedding },
        { name: "@documentType", value: "memory" },
        { name: "@tenantId", value: input.context.tenantId },
        { name: "@userId", value: input.context.userId },
      ],
    };
    const options: FeedOptions = { maxItemCount: limit, partitionKey: [input.context.tenantId, input.context.userId] };
    const started = performance.now();
    const page = await firstPage(this.container.items.query<{ c: AgentMemory; similarityScore: number }>(query, options));
    telemetry.cosmos("vector-query", page.requestCharge, performance.now() - started, input.context.correlationId);
    return page.resources.map((item) => ({ memory: item.c, similarityScore: item.similarityScore, citation: citation(item.c) }));
  }
  async forget(input: ForgetInput): Promise<void> {
    const query: SqlQuerySpec = {
      query: "SELECT TOP 1 c.id, c.threadId FROM c WHERE c.documentType = @documentType AND c.tenantId = @tenantId AND c.userId = @userId AND c.id = @id",
      parameters: [
        { name: "@documentType", value: "memory" }, { name: "@tenantId", value: input.context.tenantId },
        { name: "@userId", value: input.context.userId }, { name: "@id", value: input.id },
      ],
    };
    const page = await firstPage(this.container.items.query<{ id: string; threadId: string }>(query, {
      maxItemCount: 1, partitionKey: [input.context.tenantId, input.context.userId],
    }));
    const item = page.resources[0];
    if (!item) throw new Error("Memory not found in the authenticated user scope.");
    const response = await this.container.item(item.id, [input.context.tenantId, input.context.userId, item.threadId]).delete();
    telemetry.cosmos("delete", response.requestCharge, 0, input.context.correlationId);
  }
  async list(input: ListMemoryInput): Promise<Page<AgentMemory>> {
    const limit = Math.min(Math.max(input.limit, 1), MAX_PAGE_SIZE);
    const query: SqlQuerySpec = {
      query: "SELECT c.id, c.documentType, c.schemaVersion, c.tenantId, c.userId, c.threadId, c.agentId, c.type, c.content, c.source, c.confidence, c.createdAt, c.expiresAt, c.correlationId FROM c WHERE c.documentType = @documentType AND c.tenantId = @tenantId AND c.userId = @userId ORDER BY c.createdAt DESC",
      parameters: [
        { name: "@documentType", value: "memory" }, { name: "@tenantId", value: input.context.tenantId },
        { name: "@userId", value: input.context.userId },
      ],
    };
    const page = await firstPage(this.container.items.query<AgentMemory>(query, {
      maxItemCount: limit,
      partitionKey: [input.context.tenantId, input.context.userId],
      ...(input.continuationToken ? { continuationToken: input.continuationToken } : {}),
    }));
    return {
      items: page.resources,
      ...(page.continuationToken ? { continuationToken: page.continuationToken } : {}),
      requestCharge: page.requestCharge,
    };
  }
}
