import type { AIProvider, ChatMessage } from "../../ai/src/index.js";
import type { RequestContext } from "../../auth/src/index.js";

export type AgentRole = "planner" | "researcher" | "support-specialist" | "reviewer";

export interface AgentHandoff {
  agent: AgentRole;
  instruction: string;
  output: string;
  startedAt: string;
  completedAt: string;
}

export interface MultiAgentResult {
  runId: string;
  objective: string;
  answer: string;
  handoffs: AgentHandoff[];
  correlationId: string;
}

function selectSpecialist(objective: string): AgentRole {
  return /customer|ticket|refund|support|order/i.test(objective)
    ? "support-specialist"
    : "researcher";
}

export class MultiAgentOrchestrator {
  constructor(private readonly provider: AIProvider) {}

  private async runAgent(
    agent: AgentRole,
    instruction: string,
    context: ChatMessage[],
  ): Promise<AgentHandoff> {
    const startedAt = new Date().toISOString();
    const result = await this.provider.complete({
      messages: [
        {
          role: "system",
          content: `You are the ${agent} in a supervised agent workflow. Follow the instruction and return concise, auditable output.`,
        },
        ...context,
        { role: "user", content: instruction },
      ],
      temperature: 0.1,
    });
    return {
      agent,
      instruction,
      output: result.content,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  }

  async run(context: RequestContext, objective: string): Promise<MultiAgentResult> {
    const planner = await this.runAgent("planner", `Create a safe plan for: ${objective}`, []);
    const specialistRole = selectSpecialist(objective);
    const specialist = await this.runAgent(
      specialistRole,
      `Execute the relevant analysis for this objective: ${objective}`,
      [{ role: "assistant", content: planner.output }],
    );
    const reviewer = await this.runAgent(
      "reviewer",
      "Review the plan and specialist output. Return a final answer and flag any action that requires human approval.",
      [
        { role: "assistant", content: planner.output },
        { role: "assistant", content: specialist.output },
      ],
    );
    return {
      runId: crypto.randomUUID(),
      objective,
      answer: reviewer.output,
      handoffs: [planner, specialist, reviewer],
      correlationId: context.correlationId,
    };
  }
}
