import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export interface RequestContext {
  tenantId: string;
  userId: string;
  roles: string[];
  correlationId: string;
}

export type AuthMode = "local" | "entra";

export class AuthenticationError extends Error {
  readonly statusCode = 401;
}

export function resolveAuthMode(environment: NodeJS.ProcessEnv): AuthMode {
  const configured = environment.AUTH_MODE?.trim();
  if (configured === "local" || configured === "entra") {
    if (configured === "local" && environment.NODE_ENV === "production") {
      throw new Error("AUTH_MODE=local is not allowed in production.");
    }
    return configured;
  }
  if (configured) throw new Error('AUTH_MODE must be either "local" or "entra".');
  return environment.NODE_ENV === "production" ? "entra" : "local";
}

function headerValue(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function localContext(
  headers: Record<string, string | string[] | undefined>,
): RequestContext {
  const tenantId = headerValue(headers, "x-tenant-id")?.trim();
  const userId = headerValue(headers, "x-user-id")?.trim();
  if (!tenantId || !userId) {
    throw new AuthenticationError("Local authentication requires x-tenant-id and x-user-id headers.");
  }
  return {
    tenantId,
    userId,
    roles: (headerValue(headers, "x-roles") ?? "").split(",").map((role) => role.trim()).filter(Boolean),
    correlationId: headerValue(headers, "x-correlation-id")?.trim() || crypto.randomUUID(),
  };
}

function rolesFromClaims(payload: JWTPayload): string[] {
  if (!Array.isArray(payload.roles)) return [];
  return payload.roles.filter((role): role is string => typeof role === "string");
}

async function entraContext(
  headers: Record<string, string | string[] | undefined>,
  environment: NodeJS.ProcessEnv,
): Promise<RequestContext> {
  const authorization = headerValue(headers, "authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new AuthenticationError("A Microsoft Entra bearer token is required.");
  }
  const tenantId = environment.AUTH_ENTRA_TENANT_ID?.trim();
  const audience = environment.AUTH_ENTRA_AUDIENCE?.trim();
  if (!tenantId || !audience) {
    throw new Error("AUTH_ENTRA_TENANT_ID and AUTH_ENTRA_AUDIENCE are required for Entra authentication.");
  }
  const issuer = `https://login.microsoftonline.com/${tenantId}/v2.0`;
  try {
    const jwks = createRemoteJWKSet(
      new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`),
    );
    const { payload } = await jwtVerify(authorization.slice(7), jwks, { issuer, audience });
    const tokenTenantId = typeof payload.tid === "string" ? payload.tid : undefined;
    const userId =
      typeof payload.oid === "string"
        ? payload.oid
        : typeof payload.sub === "string"
          ? payload.sub
          : undefined;
    if (!tokenTenantId || tokenTenantId !== tenantId || !userId) {
      throw new AuthenticationError("The token does not contain the required tenant and user claims.");
    }
    return {
      tenantId: tokenTenantId,
      userId,
      roles: rolesFromClaims(payload),
      correlationId: headerValue(headers, "x-correlation-id")?.trim() || crypto.randomUUID(),
    };
  } catch (error) {
    if (error instanceof AuthenticationError) throw error;
    throw new AuthenticationError(`Microsoft Entra token validation failed: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}

export async function authenticateRequest(
  headers: Record<string, string | string[] | undefined>,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<RequestContext> {
  return resolveAuthMode(environment) === "local"
    ? localContext(headers)
    : entraContext(headers, environment);
}

export function assertSameUser(context: RequestContext, affectedUserId: string): void {
  if (context.userId !== affectedUserId) throw new Error("Cross-user access is forbidden.");
}
