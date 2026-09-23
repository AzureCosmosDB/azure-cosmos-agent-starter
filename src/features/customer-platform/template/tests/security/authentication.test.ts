import { describe, expect, it } from "vitest";
import { authenticateRequest } from "../../packages/auth/src/index.js";

describe("authentication boundaries", () => {
  it("does not permit local header authentication in production", async () => {
    await expect(authenticateRequest({
      "x-tenant-id": "forged-tenant",
      "x-user-id": "forged-user",
    }, {
      NODE_ENV: "production",
      AUTH_MODE: "local",
    })).rejects.toThrow(/not allowed/i);
  });

  it("requires a bearer token in Entra mode", async () => {
    await expect(authenticateRequest({}, {
      NODE_ENV: "production",
      AUTH_MODE: "entra",
      AUTH_ENTRA_TENANT_ID: "tenant",
      AUTH_ENTRA_AUDIENCE: "audience",
    })).rejects.toThrow(/bearer token/i);
  });
});
