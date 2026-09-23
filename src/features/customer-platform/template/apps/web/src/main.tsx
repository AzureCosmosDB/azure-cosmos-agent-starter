import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);
interface BootstrapConfig {
  authMode: "local" | "entra";
  entra?: {
    tenantId?: string;
    clientId?: string;
    scope?: string;
  };
}

let bootstrap: BootstrapConfig = { authMode: "local" };

async function startApplication() {
  bootstrap = await fetch("/api/config").then(async (response) => {
    if (!response.ok) throw new Error("Could not load authentication configuration.");
    return await response.json() as BootstrapConfig;
  });
  if (bootstrap.authMode === "entra") {
    const tenantId = bootstrap.entra?.tenantId;
    const clientId = bootstrap.entra?.clientId;
    if (!tenantId || !clientId) {
      root.render(
        <main className="configuration-error">
          <h1>Authentication configuration required</h1>
          <p>Set AUTH_ENTRA_TENANT_ID, AUTH_ENTRA_CLIENT_ID, and AUTH_ENTRA_SCOPE for the API.</p>
        </main>,
      );
      return;
    }
    const { renderEntraApplication } = await import("./EntraRoot.js");
    await renderEntraApplication(root, {
      tenantId,
      clientId,
      scope: bootstrap.entra?.scope,
    });
    return;
  }
  root.render(
    <StrictMode>
      <App authMode="local" signedIn />
    </StrictMode>,
  );
}

void startApplication().catch((error: unknown) => {
  root.render(
    <main className="configuration-error">
      <h1>Application startup failed</h1>
      <p>{error instanceof Error ? error.message : "Unknown startup error."}</p>
    </main>,
  );
});
