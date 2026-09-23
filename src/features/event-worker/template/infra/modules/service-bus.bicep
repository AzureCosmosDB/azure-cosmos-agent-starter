param token string
param location string
param runtimePrincipalId string

resource serviceBus 'Microsoft.ServiceBus/namespaces@2024-01-01' = {
  name: 'sb-${token}'
  location: location
  sku: {
    name: 'Standard'
    tier: 'Standard'
  }
}

resource queue 'Microsoft.ServiceBus/namespaces/queues@2024-01-01' = {
  parent: serviceBus
  name: 'agent-events'
  properties: {
    deadLetteringOnMessageExpiration: true
    defaultMessageTimeToLive: 'P14D'
    lockDuration: 'PT1M'
    maxDeliveryCount: 10
  }
}

var dataReceiverRoleId = '090c5cfd-751d-490a-894a-3ce6f1109419'
resource receiverRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(serviceBus.id, runtimePrincipalId, dataReceiverRoleId)
  scope: serviceBus
  properties: {
    principalId: runtimePrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', dataReceiverRoleId)
  }
}

output namespaceName string = serviceBus.name
output fullyQualifiedNamespace string = '${serviceBus.name}.servicebus.windows.net'
output queueName string = queue.name
