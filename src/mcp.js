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

function resolveConfigPath(cliConfigPath) {
  if (cliConfigPath) {
    return cliConfigPath
  }
  
  const envConfigPath = process.env.MCP_CLI_CONFIG
  if (envConfigPath) {
    return envConfigPath
  }
  
  return getClaudeConfigPath()
}

function validateConfigStructure(config, configFilePath) {
  if (!config) {
    throw new Error(`Config file is empty: ${configFilePath}`)
  }
  
  if (typeof config !== 'object' || Array.isArray(config)) {
    throw new Error(`Config file must contain a JSON object: ${configFilePath}`)
  }
  
  if (!config.mcpServers) {
    throw new Error(`Config file is missing required 'mcpServers' section: ${configFilePath}
Expected structure:
{
  "mcpServers": {
    "server-name": {
      "command": "command",
      "args": ["arg1", "arg2"]
    }
  }
}`)
  }
  
  if (typeof config.mcpServers !== 'object' || Array.isArray(config.mcpServers)) {
    throw new Error(`'mcpServers' must be an object: ${configFilePath}`)
  }
  
  if (isEmpty(config.mcpServers)) {
    throw new Error(`No MCP servers configured in: ${configFilePath}
Add server configurations to the 'mcpServers' section.`)
  }
  
  for (const [serverName, serverConfig] of Object.entries(config.mcpServers)) {
    if (!serverConfig || typeof serverConfig !== 'object') {
      throw new Error(`Server '${serverName}' configuration must be an object: ${configFilePath}`)
    }
    
    if (!serverConfig.command) {
      throw new Error(`Server '${serverName}' is missing required 'command' field: ${configFilePath}`)
    }
    
    if (typeof serverConfig.command !== 'string') {
      throw new Error(`Server '${serverName}' command must be a string: ${configFilePath}`)
    }
    
    if (serverConfig.args && !Array.isArray(serverConfig.args)) {
      throw new Error(`Server '${serverName}' args must be an array: ${configFilePath}`)
    }
  }
}

async function createClient() {
  const client = new Client({ name: 'mcp-cli', version: '1.0.0' }, { capabilities: {} })
  client.setNotificationHandler(LoggingMessageNotificationSchema, (notification) => {
    logger.debug('[server log]:', notification.params.data)
  })
  return client
}

async function listPrimitives(client) {
  const capabilities = client.getServerCapabilities()
  const primitives = []
  const promises = []
  if (capabilities.resources) {
    promises.push(
      client.listResources().then(({ resources }) => {
        resources.forEach((item) => primitives.push({ type: 'resource', value: item }))
      }),
    )
    promises.push(
      client.listResourceTemplates().then(({ resourceTemplates }) => {
        resourceTemplates.forEach((item) =>
          primitives.push({
            type: 'resource-template',
            value: item,
          }),
        )
      }),
    )
  }
  if (capabilities.tools) {
    promises.push(
      client.listTools().then(({ tools }) => {
        tools.forEach((item) => primitives.push({ type: 'tool', value: item }))
      }),
    )
  }
  if (capabilities.prompts) {
    promises.push(
      client.listPrompts().then(({ prompts }) => {
        prompts.forEach((item) => primitives.push({ type: 'prompt', value: item }))
      }),
    )
  }
  await Promise.all(promises)
  return primitives
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

  const primitives = await listPrimitives(client)
  spinner.success(`Connected, server capabilities: ${Object.keys(client.getServerCapabilities()).join(', ')}`)

  while (true) {
    const { primitive } = await prompts(
      {
        name: 'primitive',
        type: 'autocomplete',
        message: 'Pick a primitive',
        choices: primitives.map((p) => ({
          title: colors.bold(p.type + '(' + p.value.name + ')'),
          description: formatDescription(p.value.description, options.compact),
          value: p,
        })),
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
  if (!configFilePath) {
    throw new Error('No config file path provided')
  }
  
  if (!existsSync(configFilePath)) {
    throw new Error(`Config file not found: ${configFilePath}
Please check that the file exists and you have read permissions.`)
  }
  
  let spinner
  if (!silent) {
    spinner = createSpinner(`Loading config from ${configFilePath}`)
  }
  
  try {
    const configContent = await readFile(configFilePath, 'utf-8')
    
    if (!configContent.trim()) {
      throw new Error(`Config file contains no data: ${configFilePath}`)
    }
    
    let config
    try {
      config = JSON.parse(configContent)
    } catch (parseError) {
      let errorMessage = `Invalid JSON format in config file: ${configFilePath}\n`
      
      if (parseError.message.includes('Unexpected token')) {
        const match = parseError.message.match(/position (\d+)/)
        if (match) {
          const position = parseInt(match[1])
          const lines = configContent.substring(0, position).split('\n')
          const lineNumber = lines.length
          const columnNumber = lines[lines.length - 1].length + 1
          errorMessage += `Error at line ${lineNumber}, column ${columnNumber}: ${parseError.message}\n`
        } else {
          errorMessage += `Error: ${parseError.message}\n`
        }
      } else {
        errorMessage += `Error: ${parseError.message}\n`
      }
      
      errorMessage += `
Common JSON syntax issues:
- Missing commas between objects
- Trailing commas after the last item
- Unquoted property names
- Single quotes instead of double quotes`
      
      throw new Error(errorMessage)
    }
    
    validateConfigStructure(config, configFilePath)
    
    if (spinner) {
      spinner.success()
    }
    
    return config
  } catch (error) {
    if (spinner) {
      spinner.error(`Failed to load config: ${error.message}`)
    }
    
    if (error.code === 'EACCES') {
      throw new Error(`Permission denied reading config file: ${configFilePath}
Please check that you have read permissions for this file.`)
    } else if (error.code === 'ENOENT') {
      throw new Error(`Config file not found: ${configFilePath}
Please check that the file exists and the path is correct.`)
    } else if (error.code === 'EISDIR') {
      throw new Error(`Expected a file but found a directory: ${configFilePath}
Please specify a path to a JSON config file.`)
    }
    
    throw error
  }
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
    const resolvedConfigPath = resolveConfigPath(configPath)
    const config = await readConfig(resolvedConfigPath, { silent: true })

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
  const resolvedConfigPath = resolveConfigPath(configPath)
  const config = await readConfig(resolvedConfigPath)
  const server = await pickServer(config)
  const serverConfig = config.mcpServers[server]
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

async function connectRemoteServer(uri, initialTransport, options = {}) {
  const oauthConfig = { port: await getPort({ port: 49153 }), path: '/oauth/callback' }
  const createTransport = () => {
    const serverId = crypto.createHash('sha256').update(uri).digest('hex')
    const oauthRedirectUrl = `http://127.0.0.1:${oauthConfig.port}${oauthConfig.path}`
    const authProvider = new McpOAuthClientProvider(serverId, oauthRedirectUrl)
    return initialTransport(authProvider)
  }
  const transport = createTransport()
  try {
    await connectServer(transport, options)
  } catch (err) {
    if (!(err instanceof UnauthorizedError)) {
      throw err
    }
    const spinner = createSpinner('Waiting for authorization...')
    const callbackServer = new OAuthCallbackServer()
    const authCode = await callbackServer.listenForCode(oauthConfig.port, oauthConfig.path)
    await transport.finishAuth(authCode)
    spinner.success('Authorization successful')
    // connect again with a new transport
    await connectServer(createTransport(), options)
  }
}

export async function runWithSSE(uri, options = {}) {
  await connectRemoteServer(uri, (authProvider) => new SSEClientTransport(new URL(uri), { authProvider }), options)
}

export async function runWithURL(uri, options = {}) {
  await connectRemoteServer(uri, (authProvider) => new StreamableHTTPClientTransport(new URL(uri), { authProvider }), options)
}
