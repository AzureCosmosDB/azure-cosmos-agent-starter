import type { AIProvider } from "../../ai/src/index.js";
import type { RequestContext } from "../../auth/src/index.js";
import type { KnowledgeCitation, KnowledgeStore } from "../../knowledge/src/index.js";
import type { AgentMemoryStore, MemoryResult } from "../../memory/src/index.js";

export interface ChatInput {
  message: string;
  threadId: string;
  useKnowledge: boolean;
}

export interface AgentCitation {
  type: "memory" | "knowledge";
  id: string;
  label: string;
  excerpt: string;
  score: number;
}

export interface ChatResult {
  id: string;
  threadId: string;
  answer: string;
  provider: string;
  model: string;
  citations: AgentCitation[];
  correlationId: string;
}

function memoryCitations(results: MemoryResult[]): AgentCitation[] {
  return results.map((result) => ({
    type: "memory",
    id: result.memory.id,
    label: result.memory.type,
    excerpt: result.memory.content.slice(0, 280),
    score: result.similarityScore,
  }));
}

function knowledgeCitations(results: KnowledgeCitation[]): AgentCitation[] {
  return results.map((result) => ({
    type: "knowledge",
    id: result.chunkId,
    label: result.title,
    excerpt: result.excerpt,
    score: result.score,
  }));
}

export class CustomerAgentService {
  constructor(
    private readonly provider: AIProvider,
    private readonly memories: AgentMemoryStore,
    private readonly knowledge: KnowledgeStore,
  ) {}

  async chat(context: RequestContext, input: ChatInput): Promise<ChatResult> {
    const [recalledMemories, retrievedKnowledge] = await Promise.all([
      this.memories.recall({ context, query: input.message, limit: 5 }),
      input.useKnowledge ? this.knowledge.search(context, input.message, 5) : Promise.resolve([]),
    ]);
    const contextSections = [
      recalledMemories.length
        ? `Relevant user memories:\n${recalledMemories.map((result) => `- ${result.memory.content}`).join("\n")}`
        : "",
      retrievedKnowledge.length
        ? `Grounding documents:\n${retrievedKnowledge.map((result) => `- ${result.title}: ${result.excerpt}`).join("\n")}`
        : "",
    ].filter(Boolean);
    const completion = await this.provider.complete({
      messages: [
        {
          role: "system",
          content: [
            "You are a customer-facing AI assistant. Be accurate, concise, and transparent.",
            "Use supplied context only when relevant. Never claim an external action was completed.",
            "State when human approval is required for consequential actions.",
            ...contextSections,
          ].join("\n\n"),
        },
        { role: "user", content: input.message },
      ],
      temperature: 0.2,
    });
    const interactionId = crypto.randomUUID();
    await this.memories.remember({
      context,
      threadId: input.threadId,
      agentId: "{{SCENARIO_ID}}",
      type: "event",
      content: input.message,
      source: { interactionId },
      confidence: 1,
      modelVersion: completion.model,
      promptVersion: "customer-platform-v1",
    });
    return {
      id: interactionId,
      threadId: input.threadId,
      answer: completion.content,
      provider: completion.provider,
      model: completion.model,
      citations: [
        ...memoryCitations(recalledMemories),
        ...knowledgeCitations(retrievedKnowledge),
      ],
      correlationId: context.correlationId,
    };
  }
}
