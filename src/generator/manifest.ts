export interface Scenario {
  id: string;
  name: string;
  base: string;
  features: string[];
}

export interface ProjectManifest {
  schemaVersion: 1;
  language: "typescript";
  scenario: "agent-memory";
  hosting: "container-apps";
  cosmos: {
    api: "nosql";
    capacity: "serverless" | "autoscale";
    partitioning: "hierarchical";
    vectorSearch: true;
  };
  authentication: {
    production: "managed-identity";
    local: "emulator" | "azure";
  };
  features: string[];
}
