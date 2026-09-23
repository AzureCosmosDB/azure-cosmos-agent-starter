import type { Container, FeedOptions, QueryIterator, SqlQuerySpec } from "@azure/cosmos";
import type { RequestContext } from "../../auth/src/index.js";
import {
  DeterministicEmbeddingProvider,
  type EmbeddingProvider,
} from "../../memory/src/index.js";
import { getAgentStateContainer } from "../../memory/src/cosmos-client.js";

export interface KnowledgeChunk {
  id: string;
  documentType: "knowledgeChunk";
  schemaVersion: 1;
  tenantId: string;
  userId: string;
  threadId: "knowledge";
  sourceId: string;
  title: string;
  content: string;
  chunkIndex: number;
  embedding: number[];
  createdAt: string;
}

export interface KnowledgeCitation {
  chunkId: string;
  sourceId: string;
  title: string;
  excerpt: string;
  score: number;
}

export interface IngestDocumentInput {
  sourceId: string;
  title: string;
  content: string;
}

export interface KnowledgeStore {
  ingest(context: RequestContext, input: IngestDocumentInput): Promise<KnowledgeChunk[]>;
  search(context: RequestContext, query: string, limit: number): Promise<KnowledgeCitation[]>;
}

function splitDocument(content: string, chunkSize = 1_200, overlap = 150): string[] {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) throw new Error("Document content cannot be empty.");
  const chunks: string[] = [];
  let offset = 0;
  while (offset < normalized.length) {
    const upper = Math.min(offset + chunkSize, normalized.length);
    let end = upper;
    if (upper < normalized.length) {
      const boundary = normalized.lastIndexOf(" ", upper);
      if (boundary > offset + Math.floor(chunkSize / 2)) end = boundary;
    }
    chunks.push(normalized.slice(offset, end));
    if (end >= normalized.length) break;
    offset = Math.max(end - overlap, offset + 1);
  }
  return chunks;
}

function cosine(left: number[], right: number[]): number {
  const dot = left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);
  return dot / ((Math.hypot(...left) || 1) * (Math.hypot(...right) || 1));
}

function citation(chunk: KnowledgeChunk, score: number): KnowledgeCitation {
  return {
    chunkId: chunk.id,
    sourceId: chunk.sourceId,
    title: chunk.title,
    excerpt: chunk.content.slice(0, 280),
    score,
  };
}

async function createChunks(
  context: RequestContext,
  input: IngestDocumentInput,
  embeddings: EmbeddingProvider,
): Promise<KnowledgeChunk[]> {
  const parts = splitDocument(input.content);
  return Promise.all(parts.map(async (content, chunkIndex) => ({
    id: crypto.randomUUID(),
    documentType: "knowledgeChunk" as const,
    schemaVersion: 1 as const,
    tenantId: context.tenantId,
    userId: context.userId,
    threadId: "knowledge" as const,
    sourceId: input.sourceId,
    title: input.title,
    content,
    chunkIndex,
    embedding: await embeddings.embed(content),
    createdAt: new Date().toISOString(),
  })));
}

export class InMemoryKnowledgeStore implements KnowledgeStore {
  private readonly chunks = new Map<string, KnowledgeChunk>();
  constructor(private readonly embeddings: EmbeddingProvider = new DeterministicEmbeddingProvider()) {}

  async ingest(context: RequestContext, input: IngestDocumentInput): Promise<KnowledgeChunk[]> {
    const chunks = await createChunks(context, input, this.embeddings);
    for (const chunk of chunks) this.chunks.set(chunk.id, chunk);
    return chunks;
  }

  async search(context: RequestContext, query: string, limit: number): Promise<KnowledgeCitation[]> {
    const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 20);
    const vector = await this.embeddings.embed(query);
    return [...this.chunks.values()]
      .filter((chunk) => chunk.tenantId === context.tenantId && chunk.userId === context.userId)
      .map((chunk) => citation(chunk, cosine(chunk.embedding, vector)))
      .sort((left, right) => right.score - left.score)
      .slice(0, boundedLimit);
  }
}

async function firstPage<T>(iterator: QueryIterator<T>) {
  for await (const page of iterator.getAsyncIterator()) return page;
  return { resources: [] as T[] };
}

export class CosmosKnowledgeStore implements KnowledgeStore {
  constructor(
    private readonly container: Container = getAgentStateContainer(),
    private readonly embeddings: EmbeddingProvider = new DeterministicEmbeddingProvider(),
  ) {}

  async ingest(context: RequestContext, input: IngestDocumentInput): Promise<KnowledgeChunk[]> {
    const chunks = await createChunks(context, input, this.embeddings);
    await Promise.all(chunks.map((chunk) => this.container.items.create(chunk)));
    return chunks;
  }

  async search(context: RequestContext, queryText: string, limit: number): Promise<KnowledgeCitation[]> {
    const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 20);
    const embedding = await this.embeddings.embed(queryText);
    const query: SqlQuerySpec = {
      query: `SELECT TOP ${boundedLimit} c, VectorDistance(c.embedding, @embedding) AS distance
        FROM c
        WHERE c.documentType = @documentType
          AND c.tenantId = @tenantId
          AND c.userId = @userId
        ORDER BY VectorDistance(c.embedding, @embedding)`,
      parameters: [
        { name: "@embedding", value: embedding },
        { name: "@documentType", value: "knowledgeChunk" },
        { name: "@tenantId", value: context.tenantId },
        { name: "@userId", value: context.userId },
      ],
    };
    const options: FeedOptions = {
      maxItemCount: boundedLimit,
      partitionKey: [context.tenantId, context.userId, "knowledge"],
    };
    const page = await firstPage(
      this.container.items.query<{ c: KnowledgeChunk; distance: number }>(query, options),
    );
    return page.resources.map((result) => citation(result.c, 1 - result.distance));
  }
}
