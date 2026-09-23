param name string
param location string
param enabled bool = false

resource account 'Microsoft.CognitiveServices/accounts@2024-10-01' = if (enabled) {
  name: name
  location: location
  kind: 'AIServices'
  sku: { name: 'S0' }
  identity: { type: 'SystemAssigned' }
  properties: {
    customSubDomainName: name
    publicNetworkAccess: 'Enabled'
  }
}
output endpoint string = enabled ? account.properties.endpoint : ''
