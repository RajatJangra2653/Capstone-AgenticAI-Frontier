targetScope = 'resourceGroup'

param environmentName string
param location string = resourceGroup().location
param webImageName string = ''

@secure()
param FOUNDRY_ENDPOINT string
param PROJECT_NAME string
param AGENT_APP_ORCHESTRATOR string = 'Orchestrator-Agent'
param AGENT_MODEL_ORCHESTRATOR string = 'gpt-4.1'
param AGENT_APP_HR string = 'HR-Agent'
param AGENT_MODEL_HR string = 'gpt-4.1'
param AGENT_APP_IT string = 'ITSupport-Agent'
param AGENT_MODEL_IT string = 'gpt-4.1'
param AGENT_APP_FINANCE string = 'Insight-Agent'
param AGENT_MODEL_FINANCE string = 'gpt-4.1'

@secure()
param AZURE_CLIENT_ID string
@secure()
param AZURE_CLIENT_SECRET string
param AZURE_TENANT_ID string

var resourceToken = toLower(uniqueString(resourceGroup().id, environmentName, location))
var tags = { 'azd-env-name': environmentName }

module resources 'resources.bicep' = {
  name: 'resources'
  params: {
    location: location
    tags: tags
    resourceToken: resourceToken
    imageName: !empty(webImageName) ? webImageName : 'nginx:latest'
    FOUNDRY_ENDPOINT: FOUNDRY_ENDPOINT
    PROJECT_NAME: PROJECT_NAME
    AGENT_APP_ORCHESTRATOR: AGENT_APP_ORCHESTRATOR
    AGENT_MODEL_ORCHESTRATOR: AGENT_MODEL_ORCHESTRATOR
    AGENT_APP_HR: AGENT_APP_HR
    AGENT_MODEL_HR: AGENT_MODEL_HR
    AGENT_APP_IT: AGENT_APP_IT
    AGENT_MODEL_IT: AGENT_MODEL_IT
    AGENT_APP_FINANCE: AGENT_APP_FINANCE
    AGENT_MODEL_FINANCE: AGENT_MODEL_FINANCE
    AZURE_CLIENT_ID: AZURE_CLIENT_ID
    AZURE_CLIENT_SECRET: AZURE_CLIENT_SECRET
    AZURE_TENANT_ID: AZURE_TENANT_ID
  }
}

output AZURE_CONTAINER_REGISTRY_ENDPOINT string = resources.outputs.acrLoginServer
output AZURE_CONTAINER_REGISTRY_NAME string = resources.outputs.acrName
