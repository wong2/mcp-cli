import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';

const PORT = 9101;

// Create the MCP server
const server = new McpServer({
  name: 'test-sse-server',
  version: '1.0.0'
}, {
  capabilities: {
    tools: {},
    resources: {}
  }
});

// Add sample tools (same as HTTP server)
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
  description: 'Information about the test SSE server'
}, async () => ({
  contents: [{
    uri: 'server-info://status',
    text: JSON.stringify({
      server: 'test-sse-server',
      version: '1.0.0',
      transport: 'SSE',
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

// SSE endpoint - establishes the Server-Sent Events stream
app.get('/sse', async (req, res) => {
  try {
    console.log('[SSE] New SSE connection request');
    
    // Create SSE transport
    const transport = new SSEServerTransport('/messages', res, {
      enableDnsRebindingProtection: false,
      allowedHosts: ['127.0.0.1', 'localhost'],
      allowedOrigins: ['http://127.0.0.1:' + PORT, 'http://localhost:' + PORT]
    });
    
    // Store transport by session ID
    transports[transport.sessionId] = transport;
    console.log(`[SSE] Session created: ${transport.sessionId}`);
    
    // Handle transport close
    transport.onclose = () => {
      console.log(`[SSE] Session closed: ${transport.sessionId}`);
      delete transports[transport.sessionId];
    };
    
    transport.onerror = (error) => {
      console.error(`[SSE] Session error: ${transport.sessionId}`, error);
      delete transports[transport.sessionId];
    };
    
    // Handle client disconnect
    res.on('close', () => {
      console.log(`[SSE] Client disconnected: ${transport.sessionId}`);
      delete transports[transport.sessionId];
    });
    
    // Connect the MCP server to this transport
    await server.connect(transport);
    
    // Start the SSE stream
    await transport.start();
    
  } catch (error) {
    console.error('[SSE] Error establishing SSE connection:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to establish SSE connection' });
    }
  }
});

// Messages endpoint - handles POST requests from clients
app.post('/messages', async (req, res) => {
  try {
    const sessionId = req.query.sessionId || req.headers['x-mcp-session-id'];
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }
    
    const transport = transports[sessionId];
    if (!transport) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    console.log(`[SSE] Handling message for session: ${sessionId}`);
    
    // Handle the message through the transport
    await transport.handlePostMessage(req, res, req.body);
    
  } catch (error) {
    console.error('[SSE] Error handling message:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    server: 'test-sse-server',
    transport: 'SSE',
    port: PORT,
    activeSessions: Object.keys(transports).length
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 MCP Test SSE Server listening on port ${PORT}`);
  console.log(`📡 SSE endpoint: http://localhost:${PORT}/sse`);
  console.log(`📨 Messages endpoint: http://localhost:${PORT}/messages`);
  console.log(`❤️  Health check: http://localhost:${PORT}/health`);
  console.log(`🔧 Test with: mcp-cli --sse http://localhost:${PORT}/sse`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down SSE server...');
  Object.values(transports).forEach(transport => transport.close());
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Shutting down SSE server...');
  Object.values(transports).forEach(transport => transport.close());
  process.exit(0);
});