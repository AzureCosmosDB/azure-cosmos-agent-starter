import type { Container, FeedOptions, QueryIterator, SqlQuerySpec } from "@azure/cosmos";
import { createHash } from "node:crypto";
import type { RequestContext } from "../../auth/src/index.js";
import { MAX_PAGE_SIZE, type Page } from "../../shared/src/index.js";
import { telemetry } from "../../telemetry/src/index.js";
import { getAgentMemoryContainer, getConversationHistoryContainer } from "./cosmos-client.js";

export type MemoryType = "preference" | "fact" | "summary" | "event";
export type RetentionClass = "session" | "standard" | "long-term";
const RETENTION_SECONDS: Record<RetentionClass, number> = {
  session: 86_400,
  standard: 7_776_000,
  "long-term": 31_536_000,
};
export interface AgentMemory {
  id: string;
  documentType: "memory";
  schemaVersion: 2;
  tenantId: string;
  userId: string;
  threadId: string;
  agentId: string;
  type: MemoryType;
  content: string;
  embedding?: number[];
  provenance: { interactionId: string; messageId?: string; toolCallId?: string };
  confidence: number;
  createdAt: string;
  retentionClass: RetentionClass;
  ttl: number;
  correlationId: string;
  embeddingVersion: string;
  lastValidatedAt: string;
  modelVersion?: string;
  promptVersion?: string;
}
export interface MemoryResult {
  memory: AgentMemory;
  similarityScore: number;
  citation: { memoryId: string; interactionId: string; messageId?: string };
}
export interface RetrievalTrace {
  traceId: string;
  tenantId: string;
  userId: string;
  selectedMemoryIds: string[];
  embeddingVersion: string;
  generatedAt: string;
}
export interface RecallResponse {
  results: MemoryResult[];
  trace: RetrievalTrace;
}
export interface ConversationMessage {
  id: string;
  documentType: "conversationMessage";
  schemaVersion: 1;
  tenantId: string;
  userId: string;
  threadId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  ttl: number;
  correlationId: string;
}
export interface AppendConversationInput extends Scoped {
  threadId: string;
  role: ConversationMessage["role"];
  content: string;
}
export interface ConversationStore {
  append(input: AppendConversationInput): Promise<ConversationMessage>;
  list(context: RequestContext, threadId: string): Promise<ConversationMessage[]>;
}
interface Scoped { context: RequestContext }
export interface RememberInput extends Scoped {
  threadId: string; agentId: string; type: MemoryType; content: string;
  provenance: AgentMemory["provenance"]; confidence: number; retentionClass?: RetentionClass;
  modelVersion?: string; promptVersion?: string; idempotencyKey?: string;
}
export interface RecallInput extends Scoped { query: string; limit: number; threadId?: string }
export interface ForgetInput extends Scoped { id: string }
export interface ListMemoryInput extends Scoped { limit: number; continuationToken?: string }
export interface AgentMemoryStore {
  remember(input: RememberInput): Promise<AgentMemory>;
  recall(input: RecallInput): Promise<RecallResponse>;
  forget(input: ForgetInput): Promise<void>;
  list(input: ListMemoryInput): Promise<Page<AgentMemory>>;
}

export type MemoryBackend = "in-memory" | "cosmos";

export function resolveMemoryBackend(environment: NodeJS.ProcessEnv): MemoryBackend {
  const configured = environment.MEMORY_BACKEND;
  if (configured === "in-memory" || configured === "cosmos") return configured;
  if (configured) {
    throw new Error('MEMORY_BACKEND must be either "in-memory" or "cosmos".');
  }
  return environment.NODE_ENV === "production" ? "cosmos" : "in-memory";
}

export interface EmbeddingProvider {
  readonly version: string;
  embed(text: string): Promise<number[]>;
}
export class DeterministicEmbeddingProvider implements EmbeddingProvider {
  readonly version = "deterministic-v1";
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
    interactionId: memory.provenance.interactionId,
    ...(memory.provenance.messageId ? { messageId: memory.provenance.messageId } : {}),
  };
}
function cosine(left: number[], right: number[]): number {
  const dot = left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);
  return dot / ((Math.hypot(...left) || 1) * (Math.hypot(...right) || 1));
}

function memoryId(input: RememberInput): string {
  if (!input.idempotencyKey) return crypto.randomUUID();
  const scope = [
    input.context.tenantId,
    input.context.userId,
    input.threadId,
    input.idempotencyKey,
  ].join(":");
  return `memory-${createHash("sha256").update(scope).digest("hex")}`;
}

async function createMemory(
  input: RememberInput,
  embeddings: EmbeddingProvider,
): Promise<AgentMemory> {
  const createdAt = new Date().toISOString();
  const retentionClass = input.retentionClass ?? "standard";
  return {
    id: memoryId(input), documentType: "memory", schemaVersion: 2,
    tenantId: input.context.tenantId, userId: input.context.userId, threadId: input.threadId,
    agentId: input.agentId, type: input.type, content: input.content,
    embedding: await embeddings.embed(input.content), provenance: input.provenance,
    confidence: input.confidence, createdAt,
    retentionClass, ttl: RETENTION_SECONDS[retentionClass],
    correlationId: input.context.correlationId,
    embeddingVersion: embeddings.version, lastValidatedAt: createdAt,
    ...(input.modelVersion ? { modelVersion: input.modelVersion } : {}),
    ...(input.promptVersion ? { promptVersion: input.promptVersion } : {}),
  };
}

function recallResponse(input: RecallInput, results: MemoryResult[], embeddingVersion: string): RecallResponse {
  return {
    results,
    trace: {
      traceId: crypto.randomUUID(),
      tenantId: input.context.tenantId,
      userId: input.context.userId,
      selectedMemoryIds: results.map(({ memory }) => memory.id),
      embeddingVersion,
      generatedAt: new Date().toISOString(),
    },
  };
}

function isConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null &&
    ("code" in error && error.code === 409 || "statusCode" in error && error.statusCode === 409);
}

export class InMemoryMemoryStore implements AgentMemoryStore {
  private readonly items = new Map<string, AgentMemory>();
  constructor(private readonly embeddings: EmbeddingProvider = new DeterministicEmbeddingProvider()) {}
  async remember(input: RememberInput): Promise<AgentMemory> {
    const memory = await createMemory(input, this.embeddings);
    const existing = this.items.get(memory.id);
    if (existing) return existing;
    this.items.set(memory.id, memory);
    telemetry.cosmos("create", 1, 0, input.context.correlationId);
    return memory;
  }
  async recall(input: RecallInput): Promise<RecallResponse> {
    const limit = Math.min(Math.max(input.limit, 1), 20);
    const query = await this.embeddings.embed(input.query);
    const results = [...this.items.values()]
      .filter((memory) => memory.tenantId === input.context.tenantId && memory.userId === input.context.userId)
      .filter((memory) => !input.threadId || memory.threadId === input.threadId)
      .map((memory) => ({ memory, similarityScore: cosine(memory.embedding ?? [], query), citation: citation(memory) }))
      .sort((a, b) => b.similarityScore - a.similarityScore)
      .slice(0, limit);
    return recallResponse(input, results, this.embeddings.version);
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

function conversationMessage(input: AppendConversationInput): ConversationMessage {
  return {
    id: crypto.randomUUID(),
    documentType: "conversationMessage",
    schemaVersion: 1,
    tenantId: input.context.tenantId,
    userId: input.context.userId,
    threadId: input.threadId,
    role: input.role,
    content: input.content,
    createdAt: new Date().toISOString(),
    ttl: 2_592_000,
    correlationId: input.context.correlationId,
  };
}

export class InMemoryConversationStore implements ConversationStore {
  private readonly messages: ConversationMessage[] = [];

  async append(input: AppendConversationInput): Promise<ConversationMessage> {
    const message = conversationMessage(input);
    this.messages.push(message);
    return message;
  }

  async list(context: RequestContext, threadId: string): Promise<ConversationMessage[]> {
    return this.messages.filter((message) =>
      message.tenantId === context.tenantId &&
      message.userId === context.userId &&
      message.threadId === threadId);
  }
}

export class CosmosConversationStore implements ConversationStore {
  constructor(private readonly container: Container = getConversationHistoryContainer()) {}

  async append(input: AppendConversationInput): Promise<ConversationMessage> {
    const message = conversationMessage(input);
    const response = await this.container.items.create(message);
    return response.resource ?? message;
  }

  async list(context: RequestContext, threadId: string): Promise<ConversationMessage[]> {
    const query: SqlQuerySpec = {
      query: "SELECT TOP 100 * FROM c WHERE c.documentType = @documentType ORDER BY c.createdAt ASC",
      parameters: [{ name: "@documentType", value: "conversationMessage" }],
    };
    const page = await firstPage(this.container.items.query<ConversationMessage>(query, {
      maxItemCount: 100,
      partitionKey: [context.tenantId, context.userId, threadId],
    }));
    return page.resources;
  }
}

async function firstPage<T>(iterator: QueryIterator<T>) {
  for await (const page of iterator.getAsyncIterator()) return page;
  return { resources: [] as T[], requestCharge: 0, continuationToken: undefined };
}

export class CosmosAgentMemoryStore implements AgentMemoryStore {
  constructor(
    private readonly container: Container = getAgentMemoryContainer(),
    private readonly embeddings: EmbeddingProvider = new DeterministicEmbeddingProvider(),
  ) {}
  async remember(input: RememberInput): Promise<AgentMemory> {
    const memory = await createMemory(input, this.embeddings);
    const started = performance.now();
    try {
      const response = await this.container.items.create(memory, input.idempotencyKey
        ? { accessCondition: { type: "IfNoneMatch", condition: "*" } }
        : undefined);
      telemetry.cosmos("create", response.requestCharge, performance.now() - started, input.context.correlationId);
      return response.resource ?? memory;
    } catch (error) {
      if (!input.idempotencyKey || !isConflict(error)) throw error;
      const existing = await this.container
        .item(memory.id, [memory.tenantId, memory.userId])
        .read<AgentMemory>();
      if (!existing.resource) throw new Error("Idempotent memory write conflicted but no existing memory was found.");
      return existing.resource;
    }
  }
  async recall(input: RecallInput): Promise<RecallResponse> {
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
    const results = page.resources.map((item) => ({
      memory: item.c,
      similarityScore: item.similarityScore,
      citation: citation(item.c),
    }));
    return recallResponse(input, results, this.embeddings.version);
  }
  async forget(input: ForgetInput): Promise<void> {
    try {
      const response = await this.container
        .item(input.id, [input.context.tenantId, input.context.userId])
        .delete();
      telemetry.cosmos("delete", response.requestCharge, 0, input.context.correlationId);
    } catch (error) {
      const status = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
      if (status === 404) throw new Error("Memory not found in the authenticated user scope.");
      throw error;
    }
  }
  async list(input: ListMemoryInput): Promise<Page<AgentMemory>> {
    const limit = Math.min(Math.max(input.limit, 1), MAX_PAGE_SIZE);
    const query: SqlQuerySpec = {
      query: "SELECT c.id, c.documentType, c.schemaVersion, c.tenantId, c.userId, c.threadId, c.agentId, c.type, c.content, c.provenance, c.confidence, c.createdAt, c.retentionClass, c.ttl, c.correlationId, c.embeddingVersion, c.lastValidatedAt, c.modelVersion, c.promptVersion FROM c WHERE c.documentType = @documentType AND c.tenantId = @tenantId AND c.userId = @userId ORDER BY c.createdAt DESC",
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
