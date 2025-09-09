import { z } from 'zod'

const ServerConfigSchema = z.object({
  command: z.string().min(1, 'Command cannot be empty'),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional()
})

export const ConfigSchema = z.object({
  mcpServers: z.record(ServerConfigSchema).refine(
    (servers) => Object.keys(servers).length > 0,
    { message: 'mcpServers must contain at least one server configuration' }
  )
}).strict()

export function formatZodError(error, configFilePath) {
  const issues = error.errors.map(issue => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'root'
    return `  • ${path}: ${issue.message}`
  }).join('\n')
  
  return `Invalid configuration in ${configFilePath}:\n${issues}`
}