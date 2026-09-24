@description('Location for all resources')
param location string = 'centralindia'

@description('Base name used for resource naming')
param baseName string = 'capstone'

var uniqueSuffix = uniqueString(resourceGroup().id)

// ---------------- VNet + Subnets ----------------
resource vnet 'Microsoft.Network/virtualNetworks@2023-05-01' = {
  name: '${baseName}-vnet'
  location: location
  properties: {
    addressSpace: { addressPrefixes: ['10.0.0.0/16'] }
    subnets: [
      {
        name: 'AppSubnet'
        properties: {
          addressPrefix: '10.0.1.0/24'
          delegations: [
            { name: 'delegation', properties: { serviceName: 'Microsoft.Web/serverFarms' } }
          ]
        }
      }
      {
        name: 'DataSubnet'
        properties: { addressPrefix: '10.0.2.0/24' }
      }
      {
        name: 'AppGwSubnet'
        properties: { addressPrefix: '10.0.3.0/24' }
      }
    ]
  }
}

// ---------------- Cosmos DB ----------------
resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2023-11-15' = {
  name: 'cosmos-${baseName}-${uniqueSuffix}'
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    enableFreeTier: true
    publicNetworkAccess: 'Disabled'
    locations: [
      { locationName: location, failoverPriority: 0 }
    ]
    consistencyPolicy: { defaultConsistencyLevel: 'Session' }
  }
}

resource cosmosDb 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2023-11-15' = {
  parent: cosmos
  name: 'taskdb'
  properties: { resource: { id: 'taskdb' } }
}

resource boardsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-11-15' = {
  parent: cosmosDb
  name: 'boards'
  properties: {
    resource: { id: 'boards', partitionKey: { paths: ['/ownerId'], kind: 'Hash' } }
  }
}

resource tasksContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-11-15' = {
  parent: cosmosDb
  name: 'tasks'
  properties: {
    resource: { id: 'tasks', partitionKey: { paths: ['/boardId'], kind: 'Hash' } }
  }
}

// ---------------- App Service ----------------
resource appPlan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: 'asp-${baseName}'
  location: location
  sku: { name: 'B1', tier: 'Basic' }
  properties: { reserved: true }
}

resource webApp 'Microsoft.Web/sites@2023-01-01' = {
  name: 'app-${baseName}-${uniqueSuffix}'
  location: location
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: appPlan.id
    siteConfig: {
      linuxFxVersion: 'NODE|22-lts'
      appSettings: [
        { name: 'COSMOS_ENDPOINT', value: cosmos.properties.documentEndpoint }
      ]
    }
    virtualNetworkSubnetId: '${vnet.id}/subnets/AppSubnet'
  }
}

// ---------------- Cosmos RBAC for Managed Identity ----------------
resource cosmosRoleAssignment 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2023-11-15' = {
  parent: cosmos
  name: guid(cosmos.id, webApp.id, 'data-contributor')
  properties: {
    roleDefinitionId: '${cosmos.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002'
    principalId: webApp.identity.principalId
    scope: cosmos.id
  }
}

// ---------------- Storage Account (Static Website) ----------------
resource storage 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: 'st${baseName}${uniqueSuffix}'
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: { allowBlobPublicAccess: true }
}

// ---------------- Outputs ----------------
output cosmosEndpoint string = cosmos.properties.documentEndpoint
output appServiceHostName string = webApp.properties.defaultHostName
output storageWebEndpoint string = storage.properties.primaryEndpoints.web
