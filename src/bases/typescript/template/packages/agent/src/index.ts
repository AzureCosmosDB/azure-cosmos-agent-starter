import type { RequestContext } from "../../auth/src/index.js";

export interface AgentTool<TInput, TOutput> {
  name: "rememberPreference" | "recallMemory" | "forgetMemory" | "createActionRequest" | "getActionRequestStatus";
  execute(context: RequestContext, input: TInput): Promise<TOutput>;
}

export const agentSdkBoundary = {
  status: "application-owned",
  note: "Microsoft Agent Framework integration remains behind this boundary so preview APIs do not leak into domain packages.",
} as const;
