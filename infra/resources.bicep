param location string
param tags object
param resourceToken string
param imageName string

@secure()
param FOUNDRY_ENDPOINT string
param PROJECT_NAME string
param AGENT_APP_ORCHESTRATOR string
param AGENT_MODEL_ORCHESTRATOR string
param AGENT_APP_HR string
param AGENT_MODEL_HR string
param AGENT_APP_IT string
param AGENT_MODEL_IT string
param AGENT_APP_FINANCE string
param AGENT_MODEL_FINANCE string

@secure()
param AZURE_CLIENT_ID string
@secure()
param AZURE_CLIENT_SECRET string
param AZURE_TENANT_ID string

var acrName = 'acr${resourceToken}'
var logAnalyticsName = 'log-${resourceToken}'
var containerAppEnvName = 'cae-${resourceToken}'
var containerAppName = 'ca-${resourceToken}'

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: acrName
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: true
  }
}

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: logAnalyticsName
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource containerAppEnv 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: containerAppEnvName
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

resource containerApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: containerAppName
  location: location
  tags: union(tags, { 'azd-service-name': 'web' })
  properties: {
    managedEnvironmentId: containerAppEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
        allowInsecure: false
      }
      registries: [
        {
          server: acr.properties.loginServer
          username: acr.name
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        {
          name: 'acr-password'
          value: acr.listCredentials().passwords[0].value
        }
        {
          name: 'azure-client-secret'
          value: AZURE_CLIENT_SECRET
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'app'
          image: imageName
          env: [
            { name: 'PORT', value: '3000' }
            { name: 'FOUNDRY_ENDPOINT', value: FOUNDRY_ENDPOINT }
            { name: 'PROJECT_NAME', value: PROJECT_NAME }
            { name: 'AGENT_APP_ORCHESTRATOR', value: AGENT_APP_ORCHESTRATOR }
            { name: 'AGENT_MODEL_ORCHESTRATOR', value: AGENT_MODEL_ORCHESTRATOR }
            { name: 'AGENT_APP_HR', value: AGENT_APP_HR }
            { name: 'AGENT_MODEL_HR', value: AGENT_MODEL_HR }
            { name: 'AGENT_APP_IT', value: AGENT_APP_IT }
            { name: 'AGENT_MODEL_IT', value: AGENT_MODEL_IT }
            { name: 'AGENT_APP_FINANCE', value: AGENT_APP_FINANCE }
            { name: 'AGENT_MODEL_FINANCE', value: AGENT_MODEL_FINANCE }
            { name: 'AZURE_CLIENT_ID', value: AZURE_CLIENT_ID }
            { name: 'AZURE_TENANT_ID', value: AZURE_TENANT_ID }
            { name: 'AZURE_CLIENT_SECRET', secretRef: 'azure-client-secret' }
          ]
          resources: {
            cpu: json('0.5')
            memory: '1.0Gi'
          }
        }
      ]
    }
  }
}

output acrLoginServer string = acr.properties.loginServer
output acrName string = acr.name
