export interface RequestContext {
  tenantId: string;
  userId: string;
  roles: string[];
  correlationId: string;
}

export function assertSameUser(context: RequestContext, affectedUserId: string): void {
  if (context.userId !== affectedUserId) throw new Error("Cross-user access is forbidden.");
}
