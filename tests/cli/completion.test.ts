import { describe, expect, it } from "vitest";
import {
  completionCandidates,
  completionScript,
  formatCompletionCandidates,
} from "../../src/cli/completion.js";
import type { Scenario } from "../../src/generator/manifest.js";

const scenarios: Scenario[] = [
  {
    id: "chat-agent-ts",
    name: "Chat agent",
    description: "Customer chat",
    category: "chat",
    base: "typescript",
    features: [],
    capabilities: ["chat"],
  },
  {
    id: "rag-agent-ts",
    name: "RAG agent",
    description: "Document Q&A",
    category: "rag",
    base: "typescript",
    features: [],
    capabilities: ["rag"],
  },
];

describe("shell completion", () => {
  it("suggests commands and flags by prefix", () => {
    expect(completionCandidates(["w"], scenarios)).toContainEqual(
      expect.objectContaining({ value: "wizard" }),
    );
    expect(completionCandidates(["create", "--pro"], scenarios)).toContainEqual(
      expect.objectContaining({ value: "--provider" }),
    );
  });

  it("suggests dynamic templates and option values", () => {
    expect(completionCandidates(["create", "--template", "rag"], scenarios)).toEqual([
      expect.objectContaining({ value: "rag-agent-ts" }),
    ]);
    expect(completionCandidates(["create", "--provider", "az"], scenarios)).toEqual([
      expect.objectContaining({ value: "azure-openai" }),
    ]);
    expect(completionCandidates(["create", "--storage="], scenarios)).toEqual([
      expect.objectContaining({ value: "--storage=in-memory" }),
      expect.objectContaining({ value: "--storage=cosmos" }),
    ]);
  });

  it("formats descriptions and generates scripts for every shell", () => {
    expect(formatCompletionCandidates([
      { value: "chat-agent-ts", description: "Customer chat" },
    ])).toBe("chat-agent-ts\tCustomer chat");
    expect(completionScript("powershell")).toMatch(/Register-ArgumentCompleter/);
    expect(completionScript("bash")).toMatch(/complete -F/);
    expect(completionScript("zsh")).toMatch(/compdef/);
  });
});
