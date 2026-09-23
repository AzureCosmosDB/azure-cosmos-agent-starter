import "dotenv/config";
import { existsSync } from "node:fs";
import { join } from "node:path";
import express from "express";
import { z } from "zod";
import { createAIProvider, resolveAIProviderName } from "../../../packages/ai/src/index.js";
import { CustomerAgentService } from "../../../packages/agent/src/index.js";
import {
  authenticateRequest,
  AuthenticationError,
  resolveAuthMode,
} from "../../../packages/auth/src/index.js";
import {
  CosmosKnowledgeStore,
  InMemoryKnowledgeStore,
} from "../../../packages/knowledge/src/index.js";
import {
  CosmosAgentMemoryStore,
  InMemoryMemoryStore,
  resolveMemoryBackend,
} from "../../../packages/memory/src/index.js";
import { MultiAgentOrchestrator } from "../../../packages/orchestration/src/index.js";
import {
  CosmosSupportStore,
  InMemorySupportStore,
} from "../../../packages/support/src/index.js";
import {
  CosmosActionStore,
  InMemoryActionStore,
} from "../../../packages/tools/src/index.js";
import { telemetry } from "../../../packages/telemetry/src/index.js";

const scenario: {
  id: string;
  name: string;
  description: string;
  category: string;
} = {
  id: "{{SCENARIO_ID}}",
  name: "{{SCENARIO_NAME}}",
  description: "{{SCENARIO_DESCRIPTION}}",
  category: "{{SCENARIO_CATEGORY}}",
};

const capabilities: Record<string, string[]> = {
  chat: ["chat", "memory", "actions"],
  rag: ["chat", "memory", "knowledge", "citations"],
  support: ["chat", "memory", "support", "actions"],
  "multi-agent": ["chat", "memory", "orchestration", "actions"],
};

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

const useInMemory = resolveMemoryBackend(process.env) === "in-memory";
const memories = useInMemory ? new InMemoryMemoryStore() : new CosmosAgentMemoryStore();
const actions = useInMemory ? new InMemoryActionStore() : new CosmosActionStore();
const knowledge = useInMemory ? new InMemoryKnowledgeStore() : new CosmosKnowledgeStore();
const support = useInMemory ? new InMemorySupportStore() : new CosmosSupportStore();
const provider = createAIProvider(process.env);
const agent = new CustomerAgentService(provider, memories, knowledge);
const orchestrator = new MultiAgentOrchestrator(provider);

const context = (request: express.Request) => authenticateRequest(request.headers, process.env);

app.get("/health", (_request, response) => {
  response.json({ status: "ok", scenario: scenario.id });
});

app.get("/api/config", (_request, response) => {
  const authMode = resolveAuthMode(process.env);
  response.json({
    scenario,
    capabilities: capabilities[scenario.category] ?? ["chat", "memory"],
    authMode,
    ...(authMode === "entra" ? {
      entra: {
        tenantId: process.env.AUTH_ENTRA_TENANT_ID,
        clientId: process.env.AUTH_ENTRA_CLIENT_ID,
        scope: process.env.AUTH_ENTRA_SCOPE,
      },
    } : {}),
    provider: resolveAIProviderName(process.env),
    storage: useInMemory ? "in-memory" : "cosmos",
  });
});

app.post("/api/chat", async (request, response, next) => {
  try {
    const body = z.object({
      message: z.string().trim().min(1).max(20_000),
      threadId: z.string().trim().min(1).max(128).default("default"),
      useKnowledge: z.boolean().default(scenario.category === "rag"),
    }).parse(request.body);
    response.json(await agent.chat(await context(request), body));
  } catch (error) {
    next(error);
  }
});

app.get("/api/memories", async (request, response, next) => {
  try {
    response.json(await memories.list({ context: await context(request), limit: 50 }));
  } catch (error) {
    next(error);
  }
});

app.post("/api/memories", async (request, response, next) => {
  try {
    const body = z.object({
      type: z.enum(["preference", "fact", "summary", "event"]),
      content: z.string().trim().min(1).max(10_000),
      threadId: z.string().trim().min(1).max(128).default("default"),
      interactionId: z.string().trim().min(1),
    }).parse(request.body);
    const requestContext = await context(request);
    response.status(201).json(await memories.remember({
      context: requestContext,
      agentId: scenario.id,
      confidence: 1,
      ...body,
      source: { interactionId: body.interactionId },
    }));
  } catch (error) {
    next(error);
  }
});

app.post("/api/memories/recall", async (request, response, next) => {
  try {
    const body = z.object({
      query: z.string().trim().min(1),
      limit: z.number().int().min(1).max(20).default(5),
    }).parse(request.body);
    response.json(await memories.recall({ context: await context(request), ...body }));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/memories/:id", async (request, response, next) => {
  try {
    await memories.forget({ context: await context(request), id: request.params.id });
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post("/api/knowledge/documents", async (request, response, next) => {
  try {
    const body = z.object({
      sourceId: z.string().trim().min(1).max(256),
      title: z.string().trim().min(1).max(256),
      content: z.string().trim().min(1).max(1_000_000),
    }).parse(request.body);
    const chunks = await knowledge.ingest(await context(request), body);
    response.status(201).json({ sourceId: body.sourceId, chunks: chunks.length });
  } catch (error) {
    next(error);
  }
});

app.post("/api/knowledge/search", async (request, response, next) => {
  try {
    const body = z.object({
      query: z.string().trim().min(1),
      limit: z.number().int().min(1).max(20).default(5),
    }).parse(request.body);
    response.json(await knowledge.search(await context(request), body.query, body.limit));
  } catch (error) {
    next(error);
  }
});

app.get("/api/support/tickets", async (request, response, next) => {
  try {
    response.json(await support.list(await context(request)));
  } catch (error) {
    next(error);
  }
});

app.post("/api/support/tickets", async (request, response, next) => {
  try {
    const body = z.object({
      subject: z.string().trim().min(1).max(200),
      description: z.string().trim().min(1).max(20_000),
      priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
    }).parse(request.body);
    response.status(201).json(await support.create(await context(request), body));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/support/tickets/:id", async (request, response, next) => {
  try {
    const body = z.object({
      status: z.enum(["open", "in-progress", "waiting-on-customer", "resolved"]),
    }).parse(request.body);
    response.json(await support.updateStatus(await context(request), request.params.id, body.status));
  } catch (error) {
    next(error);
  }
});

app.post("/api/agents/run", async (request, response, next) => {
  try {
    const body = z.object({ objective: z.string().trim().min(1).max(20_000) }).parse(request.body);
    response.json(await orchestrator.run(await context(request), body.objective));
  } catch (error) {
    next(error);
  }
});

app.post("/api/actions", async (request, response, next) => {
  try {
    const body = z.object({
      proposedAction: z.string().trim().min(1).max(10_000),
      affectedUserId: z.string().trim().min(1),
      idempotencyKey: z.string().trim().min(8).max(256),
    }).parse(request.body);
    response.status(201).json(await actions.create(await context(request), scenario.id, body));
  } catch (error) {
    next(error);
  }
});

app.get("/api/actions/:id", async (request, response, next) => {
  try {
    response.json(await actions.get(await context(request), request.params.id));
  } catch (error) {
    next(error);
  }
});

app.post("/api/actions/:id/:decision", async (request, response, next) => {
  try {
    const decision = z.enum(["approved", "rejected"]).parse(request.params.decision);
    response.json(await actions.decide(await context(request), request.params.id, decision));
  } catch (error) {
    next(error);
  }
});

app.post("/api/actions/:id/execute", async (request, response, next) => {
  try {
    response.json(await actions.execute(await context(request), request.params.id));
  } catch (error) {
    next(error);
  }
});

app.get("/api/diagnostics", async (request, response, next) => {
  try {
    await context(request);
    response.json(telemetry.snapshot());
  } catch (error) {
    next(error);
  }
});

const webRoot = join(process.cwd(), "apps", "web", "dist");
if (existsSync(webRoot)) {
  app.use(express.static(webRoot));
  app.use((request, response, next) => {
    if (request.method === "GET" && !request.path.startsWith("/api/")) {
      response.sendFile(join(webRoot, "index.html"));
      return;
    }
    next();
  });
}

app.use((_request, response) => {
  response.status(404).json({ error: "Route not found." });
});

app.use((
  error: unknown,
  _request: express.Request,
  response: express.Response,
  _next: express.NextFunction,
) => {
  telemetry.error(error);
  const status =
    error instanceof z.ZodError
      ? 400
      : error instanceof AuthenticationError
        ? error.statusCode
        : 500;
  response.status(status).json({
    error: error instanceof Error ? error.message : "Unknown error",
    ...(error instanceof z.ZodError ? { issues: error.issues } : {}),
  });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`${scenario.name} API listening on http://localhost:${port}`);
});
