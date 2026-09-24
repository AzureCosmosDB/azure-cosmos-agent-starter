@allowed(['serverless', 'autoscale'])
param capacity string
param accountName string
param location string
param runtimePrincipalId string
param deploymentPrincipalId string = ''

resource account 'Microsoft.DocumentDB/databaseAccounts@2025-04-15' = {
  name: accountName
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    consistencyPolicy: { defaultConsistencyLevel: 'Session' }
    locations: [{ locationName: location, failoverPriority: 0, isZoneRedundant: false }]
    disableLocalAuth: true
    capabilities: concat(
      [{ name: 'EnableNoSQLVectorSearch' }],
      capacity == 'serverless' ? [{ name: 'EnableServerless' }] : []
    )
  }
}

resource serverlessDatabase 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2025-04-15' = if (capacity == 'serverless') {
  parent: account
  name: 'cosmos-agent'
  properties: { resource: { id: 'cosmos-agent' } }
}
resource autoscaleDatabase 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2025-04-15' = if (capacity == 'autoscale') {
  parent: account
  name: 'cosmos-agent'
  properties: {
    resource: { id: 'cosmos-agent' }
    options: { autoscaleSettings: { maxThroughput: 4000 } }
  }
}
resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2025-04-15' existing = {
  parent: account
  name: 'cosmos-agent'
}
resource conversations 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2025-04-15' = {
  parent: database
  name: 'conversation-history'
  properties: {
    resource: {
      id: 'conversation-history'
      partitionKey: {
        paths: ['/tenantId', '/userId', '/threadId']
        kind: 'MultiHash'
        version: 2
      }
      defaultTtl: 2592000
    }
  }
  dependsOn: [serverlessDatabase, autoscaleDatabase]
}
resource memories 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2025-04-15' = {
  parent: database
  name: 'agent-memory'
  properties: {
    resource: {
      id: 'agent-memory'
      partitionKey: {
        paths: ['/tenantId', '/userId']
        kind: 'MultiHash'
        version: 2
      }
      defaultTtl: 7776000
      vectorEmbeddingPolicy: {
        vectorEmbeddings: [{
          path: '/embedding'
          dataType: 'float32'
          distanceFunction: 'cosine'
          dimensions: 8
        }]
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
        includedPaths: [{ path: '/*' }]
        excludedPaths: [{ path: '/embedding/*' }]
        vectorIndexes: [{ path: '/embedding', type: 'quantizedFlat' }]
      }
    }
  }
  dependsOn: [serverlessDatabase, autoscaleDatabase]
}
resource applicationData 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2025-04-15' = {
  parent: database
  name: 'application-data'
  properties: {
    resource: {
      id: 'application-data'
      partitionKey: {
        paths: ['/tenantId', '/userId']
        kind: 'MultiHash'
        version: 2
      }
      vectorEmbeddingPolicy: {
        vectorEmbeddings: [{
          path: '/embedding'
          dataType: 'float32'
          distanceFunction: 'cosine'
          dimensions: 8
        }]
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
        includedPaths: [{ path: '/*' }]
        excludedPaths: [{ path: '/embedding/*' }]
        vectorIndexes: [{ path: '/embedding', type: 'quantizedFlat' }]
      }
    }
  }
  dependsOn: [serverlessDatabase, autoscaleDatabase]
}
resource actions 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2025-04-15' = {
  parent: database
  name: 'action-requests'
  properties: {
    resource: {
      id: 'action-requests'
      partitionKey: { paths: ['/tenantId', '/affectedUserId'], kind: 'MultiHash', version: 2 }
      defaultTtl: -1
    }
  }
  dependsOn: [serverlessDatabase, autoscaleDatabase]
}

var dataContributorRoleId = '00000000-0000-0000-0000-000000000002'
resource runtimeRole 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2025-04-15' = {
  parent: account
  name: guid(account.id, runtimePrincipalId, dataContributorRoleId)
  properties: {
    principalId: runtimePrincipalId
    roleDefinitionId: '${account.id}/sqlRoleDefinitions/${dataContributorRoleId}'
    scope: account.id
  }
}
resource deploymentRole 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2025-04-15' = if (!empty(deploymentPrincipalId)) {
  parent: account
  name: guid(account.id, deploymentPrincipalId, dataContributorRoleId)
  properties: {
    principalId: deploymentPrincipalId
    roleDefinitionId: '${account.id}/sqlRoleDefinitions/${dataContributorRoleId}'
    scope: account.id
  }
}

output endpoint string = account.properties.documentEndpoint
