import { DefaultAzureCredential } from "@azure/identity";

export type AIProviderName = "azure-openai" | "openai" | "ollama" | "mock";
export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatCompletionInput {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface ChatCompletion {
  content: string;
  provider: AIProviderName;
  model: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

export interface AIProvider {
  readonly name: AIProviderName;
  complete(input: ChatCompletionInput): Promise<ChatCompletion>;
}

interface OpenAIResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  model?: string;
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required for the selected AI provider.`);
  return value;
}

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<OpenAIResponse> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`AI provider request failed (${response.status}): ${detail}`);
  }
  return await response.json() as OpenAIResponse;
}

function toCompletion(
  response: OpenAIResponse,
  provider: AIProviderName,
  fallbackModel: string,
): ChatCompletion {
  const content = response.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("AI provider returned an empty response.");
  return {
    content,
    provider,
    model: response.model ?? fallbackModel,
    ...(response.usage ? {
      usage: {
        ...(response.usage.prompt_tokens === undefined ? {} : { inputTokens: response.usage.prompt_tokens }),
        ...(response.usage.completion_tokens === undefined ? {} : { outputTokens: response.usage.completion_tokens }),
      },
    } : {}),
  };
}

class MockProvider implements AIProvider {
  readonly name = "mock" as const;

  async complete(input: ChatCompletionInput): Promise<ChatCompletion> {
    const userMessage = [...input.messages].reverse().find((message) => message.role === "user");
    return {
      content: `Local demo response: ${userMessage?.content ?? "How can I help?"}`,
      provider: this.name,
      model: "local-deterministic",
    };
  }
}

class OpenAIProvider implements AIProvider {
  readonly name = "openai" as const;
  constructor(private readonly environment: NodeJS.ProcessEnv) {}

  async complete(input: ChatCompletionInput): Promise<ChatCompletion> {
    const model = this.environment.OPENAI_MODEL?.trim() || "gpt-4.1-mini";
    const baseUrl = (this.environment.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, "");
    const response = await postJson(
      `${baseUrl}/chat/completions`,
      { authorization: `Bearer ${required(this.environment, "OPENAI_API_KEY")}` },
      {
        model,
        messages: input.messages,
        temperature: input.temperature ?? 0.2,
        max_tokens: input.maxTokens ?? 1_000,
      },
    );
    return toCompletion(response, this.name, model);
  }
}

class AzureOpenAIProvider implements AIProvider {
  readonly name = "azure-openai" as const;
  private readonly credential = new DefaultAzureCredential();
  constructor(private readonly environment: NodeJS.ProcessEnv) {}

  async complete(input: ChatCompletionInput): Promise<ChatCompletion> {
    const endpoint = required(this.environment, "AZURE_OPENAI_ENDPOINT").replace(/\/$/, "");
    const deployment = required(this.environment, "AZURE_OPENAI_CHAT_DEPLOYMENT");
    const apiVersion = this.environment.AZURE_OPENAI_API_VERSION?.trim() || "2024-10-21";
    const apiKey = this.environment.AZURE_OPENAI_API_KEY?.trim();
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers["api-key"] = apiKey;
    } else {
      const token = await this.credential.getToken("https://cognitiveservices.azure.com/.default");
      if (!token?.token) throw new Error("DefaultAzureCredential did not return an Azure OpenAI token.");
      headers.authorization = `Bearer ${token.token}`;
    }
    const response = await postJson(
      `${endpoint}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`,
      headers,
      {
        messages: input.messages,
        temperature: input.temperature ?? 0.2,
        max_tokens: input.maxTokens ?? 1_000,
      },
    );
    return toCompletion(response, this.name, deployment);
  }
}

interface OllamaResponse {
  message?: { content?: string };
  model?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

class OllamaProvider implements AIProvider {
  readonly name = "ollama" as const;
  constructor(private readonly environment: NodeJS.ProcessEnv) {}

  async complete(input: ChatCompletionInput): Promise<ChatCompletion> {
    const model = this.environment.OLLAMA_MODEL?.trim() || "llama3.2";
    const baseUrl = (this.environment.OLLAMA_BASE_URL?.trim() || "http://localhost:11434").replace(/\/$/, "");
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, messages: input.messages, stream: false }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      throw new Error(`Ollama request failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
    }
    const result = await response.json() as OllamaResponse;
    const content = result.message?.content?.trim();
    if (!content) throw new Error("Ollama returned an empty response.");
    return {
      content,
      provider: this.name,
      model: result.model ?? model,
      usage: {
        ...(result.prompt_eval_count === undefined ? {} : { inputTokens: result.prompt_eval_count }),
        ...(result.eval_count === undefined ? {} : { outputTokens: result.eval_count }),
      },
    };
  }
}

export function resolveAIProviderName(environment: NodeJS.ProcessEnv): AIProviderName {
  const configured = environment.AI_PROVIDER?.trim();
  if (configured === "azure-openai" || configured === "openai" || configured === "ollama" || configured === "mock") {
    if (configured === "mock" && environment.NODE_ENV === "production") {
      throw new Error("AI_PROVIDER=mock is not allowed in production.");
    }
    return configured;
  }
  if (configured) {
    throw new Error('AI_PROVIDER must be "azure-openai", "openai", "ollama", or "mock".');
  }
  if (environment.NODE_ENV === "production") {
    throw new Error("AI_PROVIDER is required in production.");
  }
  return "mock";
}

export function createAIProvider(environment: NodeJS.ProcessEnv = process.env): AIProvider {
  const provider = resolveAIProviderName(environment);
  if (provider === "azure-openai") return new AzureOpenAIProvider(environment);
  if (provider === "openai") return new OpenAIProvider(environment);
  if (provider === "ollama") return new OllamaProvider(environment);
  return new MockProvider();
}
