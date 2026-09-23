param token string
param location string

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-${token}'
  location: location
  properties: { retentionInDays: 30 }
}
resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-${token}'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logs.id
  }
}

output connectionString string = insights.properties.ConnectionString
output workspaceId string = logs.id
