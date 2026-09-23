import { describe, expect, it } from "vitest";
import { createAIProvider, resolveAIProviderName } from "../../packages/ai/src/index.js";
import {
  authenticateRequest,
  resolveAuthMode,
} from "../../packages/auth/src/index.js";
import { InMemoryKnowledgeStore } from "../../packages/knowledge/src/index.js";
import { InMemorySupportStore } from "../../packages/support/src/index.js";

const context = {
  tenantId: "tenant-a",
  userId: "user-a",
  roles: ["user"],
  correlationId: "correlation-a",
};

describe("customer platform", () => {
  it("uses safe local defaults and rejects local adapters in production", () => {
    expect(resolveAIProviderName({ NODE_ENV: "development" })).toBe("mock");
    expect(resolveAuthMode({ NODE_ENV: "development" })).toBe("local");
    expect(() => resolveAIProviderName({ NODE_ENV: "production", AI_PROVIDER: "mock" })).toThrow(
      /not allowed/i,
    );
    expect(() => resolveAuthMode({ NODE_ENV: "production", AUTH_MODE: "local" })).toThrow(
      /not allowed/i,
    );
  });

  it("creates a deterministic local provider response", async () => {
    const provider = createAIProvider({ NODE_ENV: "development", AI_PROVIDER: "mock" });
    await expect(provider.complete({
      messages: [{ role: "user", content: "Hello customer" }],
    })).resolves.toMatchObject({
      provider: "mock",
      content: "Local demo response: Hello customer",
    });
  });

  it("derives local identity only from trusted development headers", async () => {
    await expect(authenticateRequest({
      "x-tenant-id": "tenant-a",
      "x-user-id": "user-a",
      "x-roles": "user,operator",
    }, { NODE_ENV: "development", AUTH_MODE: "local" })).resolves.toMatchObject({
      tenantId: "tenant-a",
      userId: "user-a",
      roles: ["user", "operator"],
    });
    await expect(authenticateRequest({}, {
      NODE_ENV: "development",
      AUTH_MODE: "local",
    })).rejects.toThrow(/requires x-tenant-id/i);
  });

  it("isolates knowledge retrieval by tenant and user", async () => {
    const store = new InMemoryKnowledgeStore();
    await store.ingest(context, {
      sourceId: "returns",
      title: "Returns policy",
      content: "Customers can return unopened items within thirty days.",
    });
    await expect(store.search(context, "return items", 5)).resolves.toHaveLength(1);
    await expect(store.search({ ...context, userId: "user-b" }, "return items", 5)).resolves.toEqual([]);
  });

  it("isolates support tickets by tenant and user", async () => {
    const store = new InMemorySupportStore();
    const ticket = await store.create(context, {
      subject: "Order delayed",
      description: "The order has not arrived.",
      priority: "high",
    });
    expect(await store.list(context)).toHaveLength(1);
    expect(await store.list({ ...context, tenantId: "tenant-b" })).toHaveLength(0);
    await expect(store.updateStatus(context, ticket.id, "resolved")).resolves.toMatchObject({
      status: "resolved",
    });
  });
});
