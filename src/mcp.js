import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { LoggingMessageNotificationSchema } from '@modelcontextprotocol/sdk/types.js'
import getPort from 'get-port'
import { isEmpty } from 'lodash-es'
import crypto from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import prompts from 'prompts'
import colors from 'yoctocolors'
import { OAuthCallbackServer } from './oauth/callback.js'
import { McpOAuthClientProvider } from './oauth/provider.js'
import {
  createSpinner,
  formatDescription,
  getClaudeConfigPath,
  logger,
  populateURITemplateParts,
  prettyPrint,
  readJSONSchemaInputs,
  readPromptArgumentInputs,
} from './utils.js'

// Transport factory functions
function createHTTPTransport(url, authProvider) {
  return new StreamableHTTPClientTransport(new URL(url), { authProvider })
}

function createSSETransport(url, authProvider) {
  return new SSEClientTransport(new URL(url), { authProvider })
}

async function createClient() {
  const client = new Client({ name: 'mcp-cli', version: '1.0.0' }, { capabilities: {} })
  client.setNotificationHandler(LoggingMessageNotificationSchema, (notification) => {
    logger.debug('[server log]:', notification.params.data)
  })
  return client
}

function shouldInclude(filter, type) {
  return !filter || filter === type || filter === 'all'
}

async function listPrimitives(client, filter = null) {
  const capabilities = client.getServerCapabilities()
  const promises = []

  if (capabilities.tools && shouldInclude(filter, 'tools')) {
    promises.push(client.listTools().then(result => ({ type: 'tools', data: result.tools })))
  }

  if (capabilities.resources && shouldInclude(filter, 'resources')) {
    promises.push(
      client.listResources().then(result => ({ type: 'resources', data: result.resources })),
      client.listResourceTemplates().then(result => ({ type: 'resourceTemplates', data: result.resourceTemplates }))
    )
  }

  if (capabilities.prompts && shouldInclude(filter, 'prompts')) {
    promises.push(client.listPrompts().then(result => ({ type: 'prompts', data: result.prompts })))
  }

  // Resolve all and organize by type
  const results = await Promise.all(promises)
  const rawData = {
    capabilities,
    tools: [],
    prompts: [],
    resources: [],
    resourceTemplates: []
  }

  results.forEach(({ type, data }) => {
    rawData[type] = data
  })

  // Always return consistent structure with empty arrays for unfiltered types
  const result = {
    capabilities: rawData.capabilities,
    tools: [],
    prompts: [],
    resources: [],
    resourceTemplates: []
  }
  
  if (shouldInclude(filter, 'tools')) {
    result.tools = rawData.tools
  }
  if (shouldInclude(filter, 'prompts')) {
    result.prompts = rawData.prompts
  }
  if (shouldInclude(filter, 'resources')) {
    result.resources = rawData.resources
    result.resourceTemplates = rawData.resourceTemplates
  }
  
  return result
}

// Command mapping for list operations
export const LIST_COMMANDS = {
  'list-tools': 'tools',
  'list-resources': 'resources', 
  'list-prompts': 'prompts',
  'list-all': 'all'
}

// Unified listing function that handles all list commands
async function executeListCommand(client, command, options = {}) {
  const filter = LIST_COMMANDS[command]
  if (!filter) {
    throw new Error(`Unknown list command: ${command}`)
  }
  return await listPrimitives(client, filter)
}

async function connectServer(transport, options = {}) {
  const spinner = createSpinner('Connecting to server...')

  let client
  try {
    client = await createClient()
    await client.connect(transport)
  } catch (err) {
    spinner.stop()
    throw err
  }

  const data = await listPrimitives(client)
  spinner.success(`Connected, server capabilities: ${Object.keys(client.getServerCapabilities()).join(', ')}`)

  // Build choices array from the consistent data structure
  const choices = []
  data.tools.forEach((item) => choices.push({ 
    title: colors.bold('tool(' + item.name + ')'),
    description: formatDescription(item.description, options.compact),
    value: { type: 'tool', value: item }
  }))
  data.resources.forEach((item) => choices.push({ 
    title: colors.bold('resource(' + item.name + ')'),
    description: formatDescription(item.description, options.compact),
    value: { type: 'resource', value: item }
  }))
  data.resourceTemplates.forEach((item) => choices.push({ 
    title: colors.bold('resource-template(' + item.name + ')'),
    description: formatDescription(item.description, options.compact),
    value: { type: 'resource-template', value: item }
  }))
  data.prompts.forEach((item) => choices.push({ 
    title: colors.bold('prompt(' + item.name + ')'),
    description: formatDescription(item.description, options.compact),
    value: { type: 'prompt', value: item }
  }))

  while (true) {
    const { primitive } = await prompts(
      {
        name: 'primitive',
        type: 'autocomplete',
        message: 'Pick a primitive',
        choices: choices,
      },
      {
        onCancel: async () => {
          await client.close()
          process.exit(0)
        },
      },
    )

    let result
    let spinner
    if (primitive.type === 'resource') {
      spinner = createSpinner(`Reading resource ${primitive.value.uri}...`)
      result = await client.readResource({ uri: primitive.value.uri }).catch((err) => {
        spinner.error(err.message)
        spinner = undefined
      })
    } else if (primitive.type === 'resource-template') {
      const expanded = await populateURITemplateParts(primitive.value.uriTemplate)
      if (expanded !== null) {
        spinner = createSpinner(`Reading resource ${expanded}...`)
        result = await client.readResource({ uri: expanded }).catch((err) => {
          spinner.error(err.message)
          spinner = undefined
        })
      } else {
        logger.log('\n')
      }
    } else if (primitive.type === 'tool') {
      const args = await readJSONSchemaInputs(primitive.value.inputSchema)
      spinner = createSpinner(`Using tool ${primitive.value.name}...`)
      result = await client.callTool({ name: primitive.value.name, arguments: args }).catch((err) => {
        spinner.error(err.message)
        spinner = undefined
      })
    } else if (primitive.type === 'prompt') {
      const args = await readPromptArgumentInputs(primitive.value.arguments)
      spinner = createSpinner(`Using prompt ${primitive.value.name}...`)
      result = await client.getPrompt({ name: primitive.value.name, arguments: args }).catch((err) => {
        spinner.error(err.message)
        spinner = undefined
      })
    }
    if (spinner) {
      spinner.success()
    }
    if (result) {
      prettyPrint(result)
      logger.log('\n')
    }
  }
}

async function readConfig(configFilePath, { silent = false } = {}) {
  if (!configFilePath || !existsSync(configFilePath)) {
    throw new Error(`Config file not found: ${configFilePath}`)
  }
  if (silent) {
    const config = await readFile(configFilePath, 'utf-8')
    return JSON.parse(config)
  }
  const spinner = createSpinner(`Loading config from ${configFilePath}`)
  const config = await readFile(configFilePath, 'utf-8')
  spinner.success()
  return JSON.parse(config)
}

async function pickServer(config) {
  const { server } = await prompts({
    name: 'server',
    type: 'autocomplete',
    message: 'Pick a server',
    choices: Object.keys(config.mcpServers).map((s) => ({
      title: s,
      value: s,
    })),
  })
  return server
}

export async function runWithCommand(command, args, env, options = {}) {
  const transport = new StdioClientTransport({ command, args, env })
  try {
    await connectServer(transport, options)
  } finally {
    await transport.close()
  }
}

export async function runWithConfigNonInteractive(configPath, serverName, command, target, argsString) {
  try {
    const defaultConfigFile = getClaudeConfigPath()
    const config = await readConfig(configPath || defaultConfigFile, { silent: true })
    if (!config.mcpServers || isEmpty(config.mcpServers)) {
      throw new Error('No mcp servers found in config')
    }

    const serverConfig = config.mcpServers[serverName]
    if (!serverConfig) {
      throw new Error(`Server '${serverName}' not found in config`)
    }

    if (serverConfig.env) {
      serverConfig.env = { ...serverConfig.env, PATH: process.env.PATH }
    }

    const transport = new StdioClientTransport(serverConfig)
    const client = await createClient()
    await client.connect(transport)

    let result
    let args = {}

    if (argsString) {
      try {
        args = JSON.parse(argsString)
      } catch (err) {
        throw new Error(`Invalid JSON in --args: ${err.message}`)
      }
    }

    if (command === 'call-tool') {
      result = await client.callTool({ name: target, arguments: args })
    } else if (command === 'read-resource') {
      result = await client.readResource({ uri: target })
    } else if (command === 'get-prompt') {
      result = await client.getPrompt({ name: target, arguments: args })
    }

    await client.close()
    console.log(JSON.stringify(result, null, 2))
  } catch (err) {
    console.error(JSON.stringify({ error: err.message }, null, 2))
    process.exit(1)
  }
}

export async function runWithConfig(configPath, options = {}) {
  const defaultConfigFile = getClaudeConfigPath()
  const config = await readConfig(configPath || defaultConfigFile)
  if (!config.mcpServers || isEmpty(config.mcpServers)) {
    throw new Error('No mcp servers found in config')
  }
  const server = await pickServer(config)
  const serverConfig = config.mcpServers[server]
  
  // Check if this is a URL/SSE server or stdio server
  if (serverConfig.url) {
    // URL-based server from config - use HTTP transport
    await connectRemoteServer(
      serverConfig.url,
      (authProvider) => createHTTPTransport(serverConfig.url, authProvider),
      null,
      options
    )
  } else {
    // Stdio server from config
    if (serverConfig.env) {
      serverConfig.env = { ...serverConfig.env, PATH: process.env.PATH }
    }
    const transport = new StdioClientTransport(serverConfig)
    try {
      await connectServer(transport, options)
    } finally {
      await transport.close()
    }
  }
}

async function connectRemoteServer(uri, initialTransport, connectionHandler = null, options = {}) {
  const oauthConfig = { port: await getPort({ port: 49153 }), path: '/oauth/callback' }
  const createTransport = () => {
    const serverId = crypto.createHash('sha256').update(uri).digest('hex')
    const oauthRedirectUrl = `http://127.0.0.1:${oauthConfig.port}${oauthConfig.path}`
    const authProvider = new McpOAuthClientProvider(serverId, oauthRedirectUrl)
    return initialTransport(authProvider)
  }
  
  const transport = createTransport()
  const handler = connectionHandler || ((t, opts) => connectServer(t, opts))
  
  try {
    return await handler(transport, options)
  } catch (err) {
    if (!(err instanceof UnauthorizedError)) {
      throw err
    }
    const spinner = createSpinner('Waiting for authorization...')
    const callbackServer = new OAuthCallbackServer()
    const authCode = await callbackServer.listenForCode(oauthConfig.port, oauthConfig.path)
    await transport.finishAuth(authCode)
    spinner.success('Authorization successful')
    
    // Connect again with a new transport
    return await handler(createTransport(), options)
  }
}

export async function runWithSSE(uri, options = {}) {
  await connectRemoteServer(uri, (authProvider) => createSSETransport(uri, authProvider), null, options)
}

export async function runWithURL(uri, options = {}) {
  await connectRemoteServer(uri, (authProvider) => createHTTPTransport(uri, authProvider), null, options)
}

function formatListTools(tools, options = {}) {
  if (tools.length === 0) {
    return 'No tools available'
  }
  
  const output = [colors.bold(`Tools (${tools.length}):`)]
  tools.forEach((tool) => {
    output.push(`  ${colors.cyan(tool.name)}`)
    if (tool.description) {
      const desc = formatDescription(tool.description, options.compact)
      output.push(`    ${colors.dim(desc)}`)
    }
  })
  
  return output.join('\n')
}

function formatListPrompts(prompts, options = {}) {
  if (prompts.length === 0) {
    return 'No prompts available'
  }
  
  const output = [colors.bold(`Prompts (${prompts.length}):`)]
  prompts.forEach((prompt) => {
    output.push(`  ${colors.cyan(prompt.name)}`)
    if (prompt.description) {
      const desc = formatDescription(prompt.description, options.compact)
      output.push(`    ${colors.dim(desc)}`)
    }
    if (!options.summary && prompt.arguments && prompt.arguments.length > 0) {
      output.push(`    Arguments: ${prompt.arguments.map(arg => arg.name).join(', ')}`)
    }
  })
  
  return output.join('\n')
}

function formatListResources(resources, resourceTemplates, options = {}) {
  const totalCount = resources.length + resourceTemplates.length
  
  if (totalCount === 0) {
    return 'No resources available'
  }
  
  const output = [colors.bold(`Resources (${totalCount}):`)]
  
  if (resources.length > 0) {
    const label = options.summary ? 'Static:' : 'Static Resources:'
    output.push(`  ${colors.yellow(label)}`)
    resources.forEach((resource) => {
      output.push(`    ${colors.cyan(resource.uri)}`)
      if (!options.summary && resource.name) {
        output.push(`      Name: ${resource.name}`)
      }
      if (!options.summary && resource.description) {
        const desc = formatDescription(resource.description, options.compact)
        output.push(`      ${colors.dim(desc)}`)
      }
    })
  }
  
  if (resourceTemplates.length > 0) {
    const label = options.summary ? 'Templates:' : 'Resource Templates:'
    output.push(`  ${colors.yellow(label)}`)
    resourceTemplates.forEach((template) => {
      output.push(`    ${colors.cyan(template.uriTemplate)}`)
      if (!options.summary && template.name) {
        output.push(`      Name: ${template.name}`)
      }
      if (!options.summary && template.description) {
        const desc = formatDescription(template.description, options.compact)
        output.push(`      ${colors.dim(desc)}`)
      }
    })
  }
  
  return output.join('\n')
}

function formatListAll(data, options = {}) {
  const { capabilities, tools, resources, resourceTemplates, prompts } = data
  const output = []
  const summaryOptions = { ...options, summary: true }
  
  output.push(colors.bold('Server Capabilities:'))
  output.push(`  ${Object.keys(capabilities).join(', ') || 'None'}`)
  output.push('')
  
  if (tools.length > 0) {
    output.push(formatListTools(tools, options))
    output.push('')
  }
  
  const totalResources = resources.length + resourceTemplates.length
  if (totalResources > 0) {
    output.push(formatListResources(resources, resourceTemplates, summaryOptions))
    output.push('')
  }
  
  if (prompts.length > 0) {
    output.push(formatListPrompts(prompts, summaryOptions))
  }
  
  return output.join('\n')
}

function formatListOutput(data, command, options = {}) {
  if (options.json) {
    return JSON.stringify(data, null, 2)
  }
  
  const filter = LIST_COMMANDS[command]
  
  switch (filter) {
    case 'tools':
      return formatListTools(data.tools, options)
    case 'prompts':
      return formatListPrompts(data.prompts, options)
    case 'resources':
      return formatListResources(data.resources, data.resourceTemplates, options)
    case 'all':
      return formatListAll(data, options)
    default:
      throw new Error(`Unknown filter: ${filter}`)
  }
}

async function connectServerNonInteractive(transport, options = {}) {
  const spinner = createSpinner('Connecting to server...')

  let client
  try {
    client = await createClient()
    await client.connect(transport)
  } catch (err) {
    spinner.stop()
    throw err
  }

  spinner.success(`Connected, server capabilities: ${Object.keys(client.getServerCapabilities()).join(', ')}`)
  return client
}

// connectRemoteServerForListing replaced by connectRemoteServer with connectionHandler

export async function runListCommand(configPath, serverName, command, options = {}) {
  try {
    let client
    
    if (options.url) {
      client = await connectRemoteServer(
        options.url,
        (authProvider) => createHTTPTransport(options.url, authProvider),
        (transport, opts) => connectServerNonInteractive(transport, opts),
        options
      )
    } else if (options.sse) {
      client = await connectRemoteServer(
        options.sse,
        (authProvider) => createSSETransport(options.sse, authProvider),
        (transport, opts) => connectServerNonInteractive(transport, opts),
        options
      )
    } else {
      // Config-based server
      const defaultConfigFile = getClaudeConfigPath()
      const config = await readConfig(configPath || defaultConfigFile, { silent: true })
      
      if (!config.mcpServers || isEmpty(config.mcpServers)) {
        throw new Error('No mcp servers found in config')
      }

      const serverConfig = config.mcpServers[serverName]
      if (!serverConfig) {
        throw new Error(`Server '${serverName}' not found in config`)
      }

      // Check if this is a URL/SSE server or stdio server
      if (serverConfig.url) {
        // URL-based server from config - try HTTP first since SSE may not be working
        client = await connectRemoteServer(
          serverConfig.url,
          (authProvider) => createHTTPTransport(serverConfig.url, authProvider),
          (transport, opts) => connectServerNonInteractive(transport, opts),
          options
        )
      } else {
        // Stdio server from config
        if (serverConfig.env) {
          serverConfig.env = { ...serverConfig.env, PATH: process.env.PATH }
        }

        const transport = new StdioClientTransport(serverConfig)
        client = await connectServerNonInteractive(transport, options)
      }
    }

    const result = await executeListCommand(client, command, options)

    await client.close()
    
    const output = formatListOutput(result, command, options)
    console.log(output)
    
  } catch (err) {
    console.error(colors.red(`Error: ${err.message}`))
    process.exit(1)
  }
}
