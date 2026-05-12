import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const PORT = null; // No port for stdio

// Create the MCP server
const server = new McpServer({
  name: 'test-stdio-server',
  version: '1.0.0'
}, {
  capabilities: {
    tools: {},
    resources: {}
  }
});

// Add sample tools (same as HTTP/SSE servers)
server.registerTool('add', {
  title: 'Addition Tool',
  description: 'Add two numbers together',
  inputSchema: {
    a: z.number().describe('First number'),
    b: z.number().describe('Second number')
  }
}, async ({ a, b }) => ({
  content: [{ 
    type: 'text', 
    text: `${a} + ${b} = ${a + b}` 
  }]
}));

server.registerTool('echo', {
  title: 'Echo Tool',
  description: 'Echo back the input text',
  inputSchema: {
    message: z.string().describe('Text to echo back')
  }
}, async ({ message }) => ({
  content: [{ 
    type: 'text', 
    text: `Echo: ${message}` 
  }]
}));

server.registerTool('current-time', {
  title: 'Current Time',
  description: 'Get the current date and time',
  inputSchema: {}
}, async () => ({
  content: [{ 
    type: 'text', 
    text: `Current time: ${new Date().toISOString()}` 
  }]
}));

// Add sample resources
server.registerResource('server-info', 'server-info://status', {
  title: 'Server Information',
  description: 'Information about the test stdio server'
}, async () => ({
  contents: [{
    uri: 'server-info://status',
    text: JSON.stringify({
      server: 'test-stdio-server',
      version: '1.0.0',
      transport: 'stdio',
      port: PORT,
      started: new Date().toISOString(),
      capabilities: ['tools', 'resources']
    }, null, 2),
    mimeType: 'application/json'
  }]
}));

// Create stdio transport
const transport = new StdioServerTransport();

// Connect the MCP server to the transport
async function main() {
  try {
    await server.connect(transport);
    
    // Log to stderr so it doesn't interfere with MCP protocol on stdout
    console.error('🚀 MCP Test Stdio Server started');
    console.error('📡 Transport: stdio (stdin/stdout)');
    console.error('🔧 Test with: node src/cli.js stdio-server');
    
  } catch (error) {
    console.error('Failed to start stdio server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.error('Shutting down stdio server...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.error('Shutting down stdio server...');
  process.exit(0);
});

// Start the server
main();