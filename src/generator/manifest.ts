export interface Scenario {
  id: string;
  name: string;
  description: string;
  category: "foundation" | "chat" | "rag" | "support" | "multi-agent";
  base: string;
  features: string[];
  capabilities: string[];
}

export interface ProjectManifest {
  schemaVersion: 1;
  language: "typescript";
  scenario: string;
  hosting: "container-apps";
  cosmos: {
    api: "nosql";
    capacity: "serverless" | "autoscale";
    partitioning: "hierarchical";
    vectorSearch: true;
  };
  authentication: {
    production: "entra-id";
    local: "emulator" | "azure";
  };
  features: string[];
}
