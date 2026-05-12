# Contributing to mcp-cli

Thank you for your interest in contributing to mcp-cli! This guide will help you get set up for development and understand our workflow.

## Development Environment Setup

### Prerequisites
- Node.js (version 18 or higher)
- pnpm (package manager)

### Initial Setup
```bash
# Clone the repository
git clone https://github.com/wong2/mcp-cli.git
cd mcp-cli

# Install dependencies
pnpm install
```

## Development Workflow

### Test Servers
The project includes comprehensive test servers for all MCP transport types, located in `test/servers/`:

- **stdio-server.js** - Standard input/output transport
- **http-server.js** - HTTP transport (port 9100)
- **sse-server.js** - Server-Sent Events transport (port 9101)
- **simple-http-server.js** - Simplified HTTP server

### Starting Test Servers
```bash
# Start individual servers
pnpm run server:stdio    # Stdio server (foreground)
pnpm run server:http     # HTTP server on port 9100
pnpm run server:sse      # SSE server on port 9101

# See available server commands
pnpm run server:help
```

### Testing Your Changes
```bash
# Test with different transport types
pnpm run test:stdio      # Test stdio transport
pnpm run test:http       # Test HTTP transport (requires HTTP server running)
pnpm run test:sse        # Test SSE transport (requires SSE server running)

# Test with config file
npx mcp-cli -c test/config.json stdio-server

# Test direct server connections
npx mcp-cli --url http://localhost:9100/mcp
npx mcp-cli --sse http://localhost:9101/sse
```

### Manual Testing Scenarios
1. **Interactive Mode**: Test all MCP primitives (tools, resources, prompts)
2. **Non-Interactive Mode**: Test list commands (`list-tools`, `list-resources`, etc.)
3. **Configuration**: Test both config file and direct connection methods
4. **Transport Types**: Verify all three transport types work correctly
5. **OAuth Flows**: Test authentication with protected servers

## Code Standards

### Formatting
We use Prettier for code formatting. Configuration is in `.prettierrc`.

```bash
# Format code (if you have prettier installed globally)
npx prettier --write .
```

### Code Quality
- Follow existing patterns in the codebase
- Add error handling for new features
- Ensure compatibility with all transport types
- Test both interactive and non-interactive modes

## Architecture Overview

### Key Files
- `src/cli.js` - Main CLI entry point and argument parsing
- `src/mcp.js` - Core MCP client logic and connection handling
- `src/config.js` - Configuration file loading and validation
- `src/oauth/` - OAuth authentication providers
- `src/utils.js` - Shared utility functions

### Transport Support
The CLI supports three MCP transport types:
1. **Stdio** - Process-based communication via stdin/stdout
2. **HTTP** - Modern HTTP-based transport with session management
3. **SSE** - Server-Sent Events (legacy transport)

## Making Changes

### Branch Naming
Use descriptive branch names:
- `feat/new-feature-name`
- `fix/bug-description`
- `docs/documentation-update`

### Testing Checklist
Before submitting a PR, verify:
- [ ] All transport types work (stdio, HTTP, SSE)
- [ ] Interactive mode functions correctly
- [ ] Non-interactive list commands work
- [ ] Configuration file loading works
- [ ] No regression in existing functionality
- [ ] Code follows existing style patterns

### Pull Request Process
1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes with clear commit messages
4. Test thoroughly using the test servers
5. Submit a pull request with a clear description

## Getting Help

- Check existing issues for similar problems
- Use the test servers to reproduce and debug issues
- Look at the `docs/` directory for detailed technical documentation
- Examine existing code patterns for guidance

## Development Tips

- Use `test/config.json` for testing configuration-based connections
- The test servers provide identical functionality across all transport types
- OAuth testing can be done with the HTTP and SSE servers
- Environment variables can be tested with the stdio server using `--pass-env`

Thank you for contributing to mcp-cli!