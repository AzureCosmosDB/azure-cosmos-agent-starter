import { StrictMode } from "react";
import type { Root } from "react-dom/client";
import {
  InteractionRequiredAuthError,
  PublicClientApplication,
} from "@azure/msal-browser";
import { MsalProvider, useMsal } from "@azure/msal-react";
import { App } from "./App.js";

interface EntraConfiguration {
  tenantId: string;
  clientId: string;
  scope?: string;
}

function EntraApplication({ scope }: { scope?: string }) {
  const { instance, accounts } = useMsal();
  const account = accounts[0];

  const signIn = async () => {
    if (!scope) throw new Error("AUTH_ENTRA_SCOPE is required for Entra authentication.");
    await instance.loginPopup({ scopes: [scope] });
  };

  const getAccessToken = async () => {
    if (!account || !scope) throw new Error("Sign in before calling the API.");
    try {
      return (await instance.acquireTokenSilent({ account, scopes: [scope] })).accessToken;
    } catch (error) {
      if (!(error instanceof InteractionRequiredAuthError)) throw error;
      return (await instance.acquireTokenPopup({ account, scopes: [scope] })).accessToken;
    }
  };

  return (
    <App
      authMode="entra"
      signedIn={Boolean(account)}
      userLabel={account?.name ?? account?.username}
      signIn={signIn}
      getAccessToken={getAccessToken}
    />
  );
}

export async function renderEntraApplication(
  root: Root,
  configuration: EntraConfiguration,
): Promise<void> {
  const instance = new PublicClientApplication({
    auth: {
      clientId: configuration.clientId,
      authority: `https://login.microsoftonline.com/${configuration.tenantId}`,
      redirectUri: window.location.origin,
    },
    cache: { cacheLocation: "sessionStorage" },
  });
  await instance.initialize();
  root.render(
    <StrictMode>
      <MsalProvider instance={instance}>
        <EntraApplication scope={configuration.scope} />
      </MsalProvider>
    </StrictMode>,
  );
}
