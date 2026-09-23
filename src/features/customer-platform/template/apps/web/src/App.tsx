import { FormEvent, useEffect, useMemo, useState } from "react";

type AuthMode = "local" | "entra";
type Tab = "chat" | "knowledge" | "support" | "agents" | "operations";

interface AppProps {
  authMode: AuthMode;
  signedIn: boolean;
  userLabel?: string;
  signIn?: () => Promise<void>;
  getAccessToken?: () => Promise<string>;
}

interface AppConfig {
  scenario: { id: string; name: string; description: string; category: string };
  capabilities: string[];
  authMode: AuthMode;
  provider: string;
  storage: string;
}

interface Citation {
  type: "memory" | "knowledge";
  id: string;
  label: string;
  excerpt: string;
  score: number;
}

interface ChatEntry {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
}

const tabLabels: Record<Tab, string> = {
  chat: "Chat",
  knowledge: "Knowledge",
  support: "Support",
  agents: "Agent runs",
  operations: "Operations",
};

function startingTab(category?: string): Tab {
  if (category === "rag") return "knowledge";
  if (category === "support") return "support";
  if (category === "multi-agent") return "agents";
  return "chat";
}

function JsonPanel({ value }: { value: unknown }) {
  return <pre className="result-panel">{JSON.stringify(value, null, 2)}</pre>;
}

export function App({
  authMode,
  signedIn,
  userLabel,
  signIn,
  getAccessToken,
}: AppProps) {
  const [tenantId, setTenantId] = useState("tenant-demo");
  const [userId, setUserId] = useState("user-demo");
  const [config, setConfig] = useState<AppConfig>();
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const [documentTitle, setDocumentTitle] = useState("");
  const [documentContent, setDocumentContent] = useState("");
  const [knowledgeResult, setKnowledgeResult] = useState<unknown>();
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketDescription, setTicketDescription] = useState("");
  const [tickets, setTickets] = useState<unknown[]>([]);
  const [objective, setObjective] = useState("");
  const [agentResult, setAgentResult] = useState<unknown>();
  const [diagnostics, setDiagnostics] = useState<unknown>();

  const requestHeaders = useMemo(() => ({
    "x-tenant-id": tenantId,
    "x-user-id": userId,
  }), [tenantId, userId]);

  const api = async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
    const headers = new Headers(init.headers);
    headers.set("content-type", "application/json");
    if (authMode === "local") {
      for (const [name, value] of Object.entries(requestHeaders)) headers.set(name, value);
    } else {
      if (!getAccessToken) throw new Error("Entra token acquisition is not configured.");
      headers.set("authorization", `Bearer ${await getAccessToken()}`);
    }
    const response = await fetch(path, { ...init, headers });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: response.statusText })) as { error?: string };
      throw new Error(body.error ?? `Request failed with status ${response.status}.`);
    }
    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  };

  useEffect(() => {
    fetch("/api/config")
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load application configuration.");
        return await response.json() as AppConfig;
      })
      .then((value) => {
        setConfig(value);
        setActiveTab(startingTab(value.scenario.category));
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Configuration failed."));
  }, []);

  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await operation();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The request failed.");
    } finally {
      setBusy(false);
    }
  };

  const sendMessage = (event: FormEvent) => {
    event.preventDefault();
    const content = message.trim();
    if (!content) return;
    setChat((entries) => [...entries, { role: "user", content }]);
    setMessage("");
    void run(async () => {
      const response = await api<{
        answer: string;
        citations: Citation[];
      }>("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          message: content,
          threadId: "web-session",
          useKnowledge: config?.scenario.category === "rag",
        }),
      });
      setChat((entries) => [
        ...entries,
        { role: "assistant", content: response.answer, citations: response.citations },
      ]);
    });
  };

  const ingestDocument = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const response = await api("/api/knowledge/documents", {
        method: "POST",
        body: JSON.stringify({
          sourceId: crypto.randomUUID(),
          title: documentTitle,
          content: documentContent,
        }),
      });
      setKnowledgeResult(response);
      setDocumentTitle("");
      setDocumentContent("");
    });
  };

  const createTicket = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await api("/api/support/tickets", {
        method: "POST",
        body: JSON.stringify({
          subject: ticketSubject,
          description: ticketDescription,
          priority: "normal",
        }),
      });
      setTicketSubject("");
      setTicketDescription("");
      setTickets(await api<unknown[]>("/api/support/tickets"));
    });
  };

  const runAgents = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      setAgentResult(await api("/api/agents/run", {
        method: "POST",
        body: JSON.stringify({ objective }),
      }));
    });
  };

  if (!signedIn) {
    return (
      <main className="sign-in-page">
        <section className="sign-in-card">
          <span className="eyebrow">Secure customer workspace</span>
          <h1>{config?.scenario.name ?? "{{SCENARIO_NAME}}"}</h1>
          <p>Sign in with your organization account to access tenant-scoped agent workflows.</p>
          <button className="primary-button" onClick={() => void run(async () => signIn?.())} disabled={busy}>
            {busy ? "Signing in..." : "Sign in with Microsoft"}
          </button>
          {error && <p className="error-message" role="alert">{error}</p>}
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">Cosmos Agent</span>
          <h1>{config?.scenario.name ?? "{{SCENARIO_NAME}}"}</h1>
        </div>
        <div className="status-group" aria-label="Application status">
          <span className="status-chip">{config?.provider ?? "loading"} provider</span>
          <span className="status-chip">{config?.storage ?? "loading"} storage</span>
          {userLabel && <span className="user-label">{userLabel}</span>}
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <p className="sidebar-description">{config?.scenario.description}</p>
          <nav aria-label="Agent workspace">
            {Object.entries(tabLabels).map(([tab, label]) => (
              <button
                key={tab}
                className={activeTab === tab ? "nav-button active" : "nav-button"}
                onClick={() => setActiveTab(tab as Tab)}
                aria-current={activeTab === tab ? "page" : undefined}
              >
                {label}
              </button>
            ))}
          </nav>
          {authMode === "local" && (
            <fieldset className="local-identity">
              <legend>Local identity</legend>
              <label>
                Tenant
                <input value={tenantId} onChange={(event) => setTenantId(event.target.value)} />
              </label>
              <label>
                User
                <input value={userId} onChange={(event) => setUserId(event.target.value)} />
              </label>
            </fieldset>
          )}
        </aside>

        <main className="content">
          {error && <p className="error-message" role="alert">{error}</p>}
          <p className="sr-only" aria-live="polite">{busy ? "Request in progress" : "Ready"}</p>

          {activeTab === "chat" && (
            <section aria-labelledby="chat-heading">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Conversation</span>
                  <h2 id="chat-heading">Context-aware assistant</h2>
                </div>
                <span className="status-chip">Memory enabled</span>
              </div>
              <div className="chat-window" aria-live="polite">
                {chat.length === 0 && (
                  <div className="empty-state">
                    <h3>Start with a customer goal</h3>
                    <p>Ask a question, retrieve grounded context, or propose an action for approval.</p>
                  </div>
                )}
                {chat.map((entry, index) => (
                  <article className={`message ${entry.role}`} key={`${entry.role}-${index}`}>
                    <strong>{entry.role === "user" ? "You" : "Agent"}</strong>
                    <p>{entry.content}</p>
                    {entry.citations && entry.citations.length > 0 && (
                      <details>
                        <summary>{entry.citations.length} citation{entry.citations.length === 1 ? "" : "s"}</summary>
                        <ul className="citation-list">
                          {entry.citations.map((citation) => (
                            <li key={citation.id}>
                              <strong>{citation.label}</strong>
                              <span>{citation.excerpt}</span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </article>
                ))}
              </div>
              <form className="composer" onSubmit={sendMessage}>
                <label htmlFor="message">Message</label>
                <textarea
                  id="message"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Ask the agent to help with a customer objective..."
                  rows={3}
                />
                <button className="primary-button" disabled={busy || !message.trim()}>
                  {busy ? "Working..." : "Send message"}
                </button>
              </form>
            </section>
          )}

          {activeTab === "knowledge" && (
            <section aria-labelledby="knowledge-heading">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Retrieval augmented generation</span>
                  <h2 id="knowledge-heading">Ground the agent in your content</h2>
                </div>
              </div>
              <form className="card form-grid" onSubmit={ingestDocument}>
                <label>
                  Document title
                  <input value={documentTitle} onChange={(event) => setDocumentTitle(event.target.value)} required />
                </label>
                <label>
                  Document content
                  <textarea value={documentContent} onChange={(event) => setDocumentContent(event.target.value)} rows={10} required />
                </label>
                <button className="primary-button" disabled={busy}>Ingest document</button>
              </form>
              {knowledgeResult !== undefined && <JsonPanel value={knowledgeResult} />}
            </section>
          )}

          {activeTab === "support" && (
            <section aria-labelledby="support-heading">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Customer operations</span>
                  <h2 id="support-heading">Support ticket workspace</h2>
                </div>
                <button className="secondary-button" onClick={() => void run(async () => setTickets(await api("/api/support/tickets")))}>
                  Refresh tickets
                </button>
              </div>
              <form className="card form-grid" onSubmit={createTicket}>
                <label>
                  Subject
                  <input value={ticketSubject} onChange={(event) => setTicketSubject(event.target.value)} required />
                </label>
                <label>
                  Description
                  <textarea value={ticketDescription} onChange={(event) => setTicketDescription(event.target.value)} rows={5} required />
                </label>
                <button className="primary-button" disabled={busy}>Create ticket</button>
              </form>
              <div className="card-grid">
                {tickets.map((ticket, index) => <JsonPanel key={index} value={ticket} />)}
              </div>
            </section>
          )}

          {activeTab === "agents" && (
            <section aria-labelledby="agents-heading">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Supervised orchestration</span>
                  <h2 id="agents-heading">Run a traceable agent team</h2>
                </div>
              </div>
              <form className="card form-grid" onSubmit={runAgents}>
                <label>
                  Objective
                  <textarea value={objective} onChange={(event) => setObjective(event.target.value)} rows={5} required />
                </label>
                <button className="primary-button" disabled={busy}>Run agents</button>
              </form>
              {agentResult !== undefined && <JsonPanel value={agentResult} />}
            </section>
          )}

          {activeTab === "operations" && (
            <section aria-labelledby="operations-heading">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Reliability</span>
                  <h2 id="operations-heading">Runtime diagnostics</h2>
                </div>
                <button className="secondary-button" onClick={() => void run(async () => setDiagnostics(await api("/api/diagnostics")))}>
                  Load diagnostics
                </button>
              </div>
              <div className="metric-grid">
                <article className="metric-card"><span>Provider</span><strong>{config?.provider}</strong></article>
                <article className="metric-card"><span>Storage</span><strong>{config?.storage}</strong></article>
                <article className="metric-card"><span>Authentication</span><strong>{config?.authMode}</strong></article>
              </div>
              {diagnostics !== undefined && <JsonPanel value={diagnostics} />}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
