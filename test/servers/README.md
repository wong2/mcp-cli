# MCP Test Servers

This directory contains test servers for all three MCP transport types to help test and demonstrate MCP connectivity.

## Servers

### Stdio Server (`stdio-server.js`)
- **Transport**: StdioServerTransport 
- **Communication**: stdin/stdout
- **Features**: Standard MCP stdio protocol

### HTTP Server (`http-server.js`)
- **Port**: 9100
- **Transport**: StreamableHTTPServerTransport
- **Endpoint**: `http://localhost:9100/mcp`
- **Features**: Session management, modern HTTP transport

### SSE Server (`sse-server.js`)
- **Port**: 9101
- **Transport**: SSEServerTransport (Legacy)
- **SSE Endpoint**: `http://localhost:9101/sse`
- **Messages Endpoint**: `http://localhost:9101/messages`
- **Features**: Server-Sent Events streaming

## Usage

### Starting the Servers

Using npm scripts (recommended):
```bash
# Start stdio server (runs in foreground)
pnpm run server:stdio

# Start HTTP server
pnpm run server:http

# Start SSE server (in another terminal)
pnpm run server:sse

# Test stdio client connection (launches server directly)
pnpm run test:stdio

# Test HTTP client connection (requires HTTP server to be running)
pnpm run test:http

# Test SSE client connection (requires SSE server to be running)
pnpm run test:sse
```

Or using node directly:
```bash
# Start stdio server
node test/servers/stdio-server.js

# Start HTTP server
node test/servers/http-server.js

# Start SSE server (in another terminal)
node test/servers/sse-server.js
```

### Testing with mcp-cli

```bash
# Test stdio server (direct command - recommended)
mcp-cli node test/servers/stdio-server.js

# Test stdio server (from config - alternative)
mcp-cli --config mcp_config.json stdio-server

# Test HTTP server
mcp-cli --url http://localhost:9100/mcp

# Test SSE server
mcp-cli --sse http://localhost:9101/sse
```

## Available Features

All three servers provide identical MCP functionality:

### Tools
- **add**: Add two numbers together
  - Parameters: `a` (number), `b` (number)
- **echo**: Echo back input text
  - Parameters: `message` (string)
- **current-time**: Get current timestamp
  - Parameters: none

### Resources
- **server-info://status**: Server information and status
  - Returns JSON with server details, version, transport type, etc.

## Health Checks

Both servers provide health check endpoints:

```bash
# HTTP server health
curl http://localhost:9100/health

# SSE server health
curl http://localhost:9101/health
```

## Example Interactions

### Using Tools
```bash
# Test addition tool
{"method": "call_tool", "params": {"name": "add", "arguments": {"a": 5, "b": 3}}}

# Test echo tool
{"method": "call_tool", "params": {"name": "echo", "arguments": {"message": "Hello MCP!"}}}

# Test time tool
{"method": "call_tool", "params": {"name": "current-time", "arguments": {}}}
```

### Reading Resources
```bash
# Get server information
{"method": "read_resource", "params": {"uri": "server-info://status"}}
```

## Transport Differences

### Stdio
- Standard transport for command-line tools
- Uses stdin/stdout for communication
- Most compatible and widely supported
- Process-based isolation

### HTTP (StreamableHTTP)
- Modern transport protocol
- Single endpoint handles all requests
- Built-in session management
- Better error handling and resilience
- Supports resumable connections

### SSE (Server-Sent Events)
- Legacy transport (deprecated)
- Separate endpoints for SSE stream and messages
- Simpler but less robust
- Limited error recovery

## Testing All Transports

These servers allow you to test the differences between stdio, HTTP and SSE transports:

1. **Performance**: Compare response times and throughput
2. **Reliability**: Test connection handling and recovery
3. **Features**: Verify all MCP features work on all transports
4. **Client Compatibility**: Ensure clients work with all transport protocols

## Notes

- All three servers use the same MCP SDK (`@modelcontextprotocol/sdk`)
- DNS rebinding protection is enabled for security
- Graceful shutdown is implemented (Ctrl+C)
- Session management tracks active connections
- All endpoints include proper error handling