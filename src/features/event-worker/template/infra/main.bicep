targetScope = 'subscription'

@minLength(1)
param environmentName string
param location string = deployment().location
param capacity string = '{{CAPACITY}}'
param principalId string = ''
param imageName string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
@allowed([
  'azure-openai'
  'openai'
  'ollama'
])
param aiProvider string = 'azure-openai'
param azureOpenAIEndpoint string = ''
param azureOpenAIChatDeployment string = ''
@secure()
param openAIApiKey string = ''
param openAIModel string = 'gpt-4.1-mini'
param openAIBaseUrl string = 'https://api.openai.com/v1'
param ollamaBaseUrl string = 'http://localhost:11434'
param ollamaModel string = 'llama3.2'

var resourceToken = toLower(uniqueString(subscription().id, environmentName, location))
var resourceGroupName = 'rg-${environmentName}'

resource resourceGroup 'Microsoft.Resources/resourceGroups@2024-11-01' = {
  name: resourceGroupName
  location: location
}

module identity 'modules/identity.bicep' = {
  name: 'identity'
  scope: resourceGroup
  params: { name: 'id-${resourceToken}', location: location }
}
module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring'
  scope: resourceGroup
  params: { token: resourceToken, location: location }
}
module cosmos 'modules/cosmos.bicep' = {
  name: 'cosmos'
  scope: resourceGroup
  params: {
    accountName: 'cosmos-${resourceToken}'
    location: location
    capacity: capacity
    runtimePrincipalId: identity.outputs.principalId
    deploymentPrincipalId: principalId
  }
}
module serviceBus 'modules/service-bus.bicep' = {
  name: 'service-bus'
  scope: resourceGroup
  params: {
    token: resourceToken
    location: location
    runtimePrincipalId: identity.outputs.principalId
  }
}
module app 'modules/container-apps.bicep' = {
  name: 'container-apps'
  scope: resourceGroup
  params: {
    token: resourceToken
    location: location
    imageName: imageName
    identityId: identity.outputs.id
    cosmosEndpoint: cosmos.outputs.endpoint
    appInsightsConnectionString: monitoring.outputs.connectionString
    serviceBusNamespace: serviceBus.outputs.fullyQualifiedNamespace
    serviceBusScaleNamespace: serviceBus.outputs.namespaceName
    serviceBusQueue: serviceBus.outputs.queueName
    aiProvider: aiProvider
    azureOpenAIEndpoint: azureOpenAIEndpoint
    azureOpenAIChatDeployment: azureOpenAIChatDeployment
    openAIApiKey: openAIApiKey
    openAIModel: openAIModel
    openAIBaseUrl: openAIBaseUrl
    ollamaBaseUrl: ollamaBaseUrl
    ollamaModel: ollamaModel
  }
}

output AZURE_LOCATION string = location
output AZURE_RESOURCE_GROUP string = resourceGroupName
output COSMOS_ENDPOINT string = cosmos.outputs.endpoint
output SERVICE_BUS_NAMESPACE string = serviceBus.outputs.fullyQualifiedNamespace
output SERVICE_BUS_QUEUE string = serviceBus.outputs.queueName
