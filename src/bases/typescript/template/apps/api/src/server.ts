import "dotenv/config";
import express from "express";
import { z } from "zod";
import {
  CosmosAgentMemoryStore,
  InMemoryMemoryStore,
  resolveMemoryBackend,
} from "../../../packages/memory/src/index.js";
import {
  CosmosActionStore,
  InMemoryActionStore,
} from "../../../packages/tools/src/index.js";
import { telemetry } from "../../../packages/telemetry/src/index.js";
import type { RequestContext } from "../../../packages/auth/src/index.js";

const app = express();
app.use(express.json({ limit: "64kb" }));
const useInMemory = resolveMemoryBackend(process.env) === "in-memory";
const memories = useInMemory ? new InMemoryMemoryStore() : new CosmosAgentMemoryStore();
const actions = useInMemory ? new InMemoryActionStore() : new CosmosActionStore();

function contextFromHeaders(request: express.Request): RequestContext {
  const tenantId = request.header("x-tenant-id");
  const userId = request.header("x-user-id");
  if (!tenantId || !userId) throw new Error("Authenticated tenant and user headers are required.");
  return {
    tenantId,
    userId,
    roles: (request.header("x-roles") ?? "").split(",").filter(Boolean),
    correlationId: request.header("x-correlation-id") ?? crypto.randomUUID(),
  };
}

app.get("/health", (_request, response) => response.json({ status: "ok" }));
app.get("/api/memories", async (request, response, next) => {
  try {
    response.json(await memories.list({ context: contextFromHeaders(request), limit: 50 }));
  } catch (error) { next(error); }
});
app.post("/api/memories", async (request, response, next) => {
  try {
    const body = z.object({
      type: z.enum(["preference", "fact", "summary", "event"]),
      content: z.string().min(1).max(10_000),
      threadId: z.string().min(1).max(128).default("default"),
      interactionId: z.string().min(1),
    }).parse(request.body);
    const context = contextFromHeaders(request);
    response.status(201).json(await memories.remember({
      context, agentId: "sample-agent", confidence: 1, ...body,
      source: { interactionId: body.interactionId },
    }));
  } catch (error) { next(error); }
});
app.post("/api/memories/recall", async (request, response, next) => {
  try {
    const body = z.object({ query: z.string().min(1), limit: z.number().int().min(1).max(20).default(5) }).parse(request.body);
    response.json(await memories.recall({ context: contextFromHeaders(request), ...body }));
  } catch (error) { next(error); }
});
app.delete("/api/memories/:id", async (request, response, next) => {
  try {
    await memories.forget({ context: contextFromHeaders(request), id: request.params.id });
    response.status(204).end();
  } catch (error) { next(error); }
});
app.post("/api/actions", async (request, response, next) => {
  try {
    const body = z.object({ proposedAction: z.string().min(1), affectedUserId: z.string().min(1), idempotencyKey: z.string().min(8) }).parse(request.body);
    response.status(201).json(await actions.create(contextFromHeaders(request), "sample-agent", body));
  } catch (error) { next(error); }
});
app.post("/api/actions/:id/:decision", async (request, response, next) => {
  try {
    const decision = z.enum(["approved", "rejected"]).parse(request.params.decision);
    response.json(await actions.decide(contextFromHeaders(request), request.params.id, decision));
  } catch (error) { next(error); }
});
app.post("/api/actions/:id/execute", async (request, response, next) => {
  try {
    response.json(await actions.execute(contextFromHeaders(request), request.params.id));
  } catch (error) { next(error); }
});
app.get("/api/diagnostics", (_request, response) => response.json(telemetry.snapshot()));
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  telemetry.error(error);
  response.status(error instanceof z.ZodError ? 400 : 403).json({ error: error instanceof Error ? error.message : "Unknown error" });
});
app.listen(Number(process.env.PORT ?? 3000), () => console.log("Cosmos Agent API listening on http://localhost:3000"));
