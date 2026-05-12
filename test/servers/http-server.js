import express from 'express';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

const PORT = 9100;

// Create the MCP server
const server = new McpServer({
  name: 'test-http-server',
  version: '1.0.0'
}, {
  capabilities: {
    tools: {},
    resources: {}
  }
});

// Add sample tools
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
  description: 'Information about the test HTTP server'
}, async () => ({
  contents: [{
    uri: 'server-info://status',
    text: JSON.stringify({
      server: 'test-http-server',
      version: '1.0.0',
      transport: 'StreamableHTTP',
      port: PORT,
      started: new Date().toISOString(),
      capabilities: ['tools', 'resources']
    }, null, 2),
    mimeType: 'application/json'
  }]
}));

// Create Express app
const app = express();
app.use(express.json());

// Store transports by session ID
const transports = {};

// Single transport instance for the server
const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => randomUUID(),
  enableDnsRebindingProtection: false,
  onsessioninitialized: (sessionId) => {
    console.log(`[HTTP] New session initialized: ${sessionId}`);
  },
  onsessionclosed: (sessionId) => {
    console.log(`[HTTP] Session closed: ${sessionId}`);
  }
});

// Connect the MCP server to the transport once
server.connect(transport).then(() => {
  console.log('[HTTP] MCP server connected to transport');
}).catch(error => {
  console.error('[HTTP] Failed to connect MCP server to transport:', error);
});

// Handle all MCP requests
app.all('/mcp', async (req, res) => {
  try {
    console.log(`[HTTP] ${req.method} ${req.url}`);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('[HTTP] Error handling request:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    server: 'test-http-server',
    transport: 'StreamableHTTP',
    port: PORT
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 MCP Test HTTP Server listening on port ${PORT}`);
  console.log(`📡 MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`❤️  Health check: http://localhost:${PORT}/health`);
  console.log(`🔧 Test with: mcp-cli --url http://localhost:${PORT}/mcp`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down HTTP server...');
  Object.values(transports).forEach(transport => transport.close());
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Shutting down HTTP server...');
  Object.values(transports).forEach(transport => transport.close());
  process.exit(0);
});