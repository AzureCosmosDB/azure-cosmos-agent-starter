param token string
param location string
param imageName string
param identityId string
param cosmosEndpoint string
param appInsightsConnectionString string
param serviceBusNamespace string
param serviceBusScaleNamespace string
param serviceBusQueue string
param aiProvider string
param azureOpenAIEndpoint string
param azureOpenAIChatDeployment string
@secure()
param openAIApiKey string
param openAIModel string
param openAIBaseUrl string
param ollamaBaseUrl string
param ollamaModel string

var commonEnvironment = [
  { name: 'NODE_ENV', value: 'production' }
  { name: 'MEMORY_BACKEND', value: 'cosmos' }
  { name: 'EVENT_TRANSPORT', value: 'service-bus' }
  { name: 'SERVICE_BUS_NAMESPACE', value: serviceBusNamespace }
  { name: 'SERVICE_BUS_QUEUE', value: serviceBusQueue }
  { name: 'AI_PROVIDER', value: aiProvider }
  { name: 'AZURE_OPENAI_ENDPOINT', value: azureOpenAIEndpoint }
  { name: 'AZURE_OPENAI_CHAT_DEPLOYMENT', value: azureOpenAIChatDeployment }
  { name: 'OPENAI_MODEL', value: openAIModel }
  { name: 'OPENAI_BASE_URL', value: openAIBaseUrl }
  { name: 'OLLAMA_BASE_URL', value: ollamaBaseUrl }
  { name: 'OLLAMA_MODEL', value: ollamaModel }
  { name: 'COSMOS_ENDPOINT', value: cosmosEndpoint }
  { name: 'COSMOS_DATABASE', value: 'cosmos-agent' }
  { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
]
var providerSecrets = !empty(openAIApiKey) ? [{
  name: 'openai-api-key'
  value: openAIApiKey
}] : []
var providerEnvironment = !empty(openAIApiKey) ? [{
  name: 'OPENAI_API_KEY'
  secretRef: 'openai-api-key'
}] : []

resource environment 'Microsoft.App/managedEnvironments@2025-01-01' = {
  name: 'cae-${token}'
  location: location
}

resource worker 'Microsoft.App/containerApps@2025-01-01' = {
  name: 'worker-${token}'
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identityId}': {} }
  }
  tags: { 'azd-service-name': 'worker' }
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      secrets: providerSecrets
    }
    template: {
      containers: [{
        name: 'worker'
        image: imageName
        env: concat(commonEnvironment, providerEnvironment)
        resources: { cpu: json('0.5'), memory: '1Gi' }
      }]
      scale: {
        minReplicas: 0
        maxReplicas: 10
        rules: [{
          name: 'service-bus'
          custom: {
            type: 'azure-servicebus'
            metadata: {
              namespace: serviceBusScaleNamespace
              queueName: serviceBusQueue
              messageCount: '1'
            }
            identity: identityId
          }
        }]
      }
    }
  }
}
