import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import prompts from 'prompts'
import { createSpinner } from '../utils.js'
import { ConfigSchema, formatZodError } from './schema.js'

function resolveConfigPath(cliConfigPath) {
  // Priority: CLI arg → env var → platform default
  if (cliConfigPath) {
    return cliConfigPath
  }
  
  const envConfigPath = process.env.MCP_CLI_CONFIG
  if (envConfigPath) {
    return envConfigPath
  }
  
  if (process.platform === 'win32') {
    return join(homedir(), 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json')
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
  }
}

function validateConfig(config, configFilePath) {
  const result = ConfigSchema.safeParse(config)
  
  if (!result.success) {
    throw new Error(formatZodError(result.error, configFilePath))
  }
  
  return result.data
}

export async function loadConfig(configPath, { silent = false } = {}) {
  const resolvedPath = resolveConfigPath(configPath)
  
  if (!resolvedPath) {
    throw new Error('No config file path provided')
  }
  
  if (!existsSync(resolvedPath)) {
    throw new Error(`Config file not found: ${resolvedPath}
Please check that the file exists and you have read permissions.`)
  }
  
  let spinner
  if (!silent) {
    spinner = createSpinner(`Loading config from ${resolvedPath}`)
  }
  
  try {
    const configContent = await readFile(resolvedPath, 'utf-8')
    
    if (!configContent.trim()) {
      throw new Error(`Config file contains no data: ${resolvedPath}`)
    }
    
    let config
    try {
      config = JSON.parse(configContent)
    } catch (parseError) {
      let errorMessage = `Invalid JSON in config file: ${resolvedPath}\n`
      
      // Add line/column info if available
      if (parseError.message.includes('Unexpected token')) {
        const match = parseError.message.match(/position (\d+)/)
        if (match) {
          const position = parseInt(match[1])
          const lines = configContent.substring(0, position).split('\n')
          const lineNumber = lines.length
          const columnNumber = lines[lines.length - 1].length + 1
          errorMessage += `Error at line ${lineNumber}, column ${columnNumber}\n`
        }
      }
      
      errorMessage += `Common issues: missing commas, trailing commas, unquoted property names`
      throw new Error(errorMessage)
    }
    
    const validatedConfig = validateConfig(config, resolvedPath)
    
    if (spinner) {
      spinner.success()
    }
    
    return validatedConfig
  } catch (error) {
    if (spinner) {
      spinner.error(`Failed to load config: ${error.message}`)
    }
    
    // Handle file system errors
    if (error.code === 'EACCES') {
      throw new Error(`Permission denied reading config file: ${resolvedPath}`)
    } else if (error.code === 'ENOENT') {
      throw new Error(`Config file not found: ${resolvedPath}`)
    } else if (error.code === 'EISDIR') {
      throw new Error(`Expected file but found directory: ${resolvedPath}`)
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

