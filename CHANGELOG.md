# 2.0.0

- **Breaking**: require Node.js 20 or newer
- Upgrade dependencies to latest (major bumps: `conf`, `eventsource`, `meow`, `open`, `yocto-spinner`)

# 1.13.0

- Add `--compact` flag to truncate primitive descriptions to a single line
- Sanitize authorization URL before opening it

# 1.12.0

- Fix `listResourceTemplates` error when the server has no resources capability
- Close transport correctly

# 1.11.0

- Add non-interactive mode (`call-tool` / `read-resource` / `get-prompt`)
- Add support for resource templates

# 1.10.0

- Add `@wong2/mcp-cli purge` command to clear stored OAuth data

# 1.9.0

- Add OAuth support for SSE and Streamable HTTP servers

# 1.8.0

- Add `--pass-env` flag for passing environment variables in current shell to stdio server

# 1.7.0

- Add support for streamable HTTP endpoint

# 1.6.0

- Ensure `PATH` is set in server environment

# 1.5.0

- Fix running command with flags
- Upgrade dependencies
