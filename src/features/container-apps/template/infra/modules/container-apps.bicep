param token string
param location string
param imageName string
param identityId string
param cosmosEndpoint string
param appInsightsConnectionString string

resource environment 'Microsoft.App/managedEnvironments@2025-01-01' = {
  name: 'cae-${token}'
  location: location
}
resource api 'Microsoft.App/containerApps@2025-01-01' = {
  name: 'api-${token}'
  location: location
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${identityId}': {} } }
  tags: { 'azd-service-name': 'api' }
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: { external: true, targetPort: 3000, transport: 'auto' }
    }
    template: {
      containers: [{
        name: 'api'
        image: imageName
        env: [
          { name: 'NODE_ENV', value: 'production' }
          { name: 'COSMOS_ENDPOINT', value: cosmosEndpoint }
          { name: 'COSMOS_DATABASE', value: 'cosmos-agent' }
          { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
        ]
        resources: { cpu: json('0.5'), memory: '1Gi' }
      }]
      scale: { minReplicas: 0, maxReplicas: 3 }
    }
  }
}
output uri string = 'https://${api.properties.configuration.ingress.fqdn}'
