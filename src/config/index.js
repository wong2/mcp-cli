import { isEmpty } from 'lodash-es'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import prompts from 'prompts'
import { createSpinner } from '../utils.js'

export function getClaudeConfigPath() {
  if (process.platform === 'win32') {
    return join(homedir(), 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json')
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
  }
}

export function resolveConfigPath(cliConfigPath) {
  if (cliConfigPath) {
    return cliConfigPath
  }
  
  const envConfigPath = process.env.MCP_CLI_CONFIG
  if (envConfigPath) {
    return envConfigPath
  }
  
  return getClaudeConfigPath()
}

export function validateConfigStructure(config, configFilePath) {
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

export async function readConfig(configFilePath, { silent = false } = {}) {
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

export async function pickServer(config) {
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