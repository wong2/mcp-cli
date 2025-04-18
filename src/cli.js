#!/usr/bin/env node

import meow from "meow";
import "./eventsource-polyfill.js";
import { runWithCommand, runWithConfig, runWithSSE, runWithURL } from "./mcp.js";

const cli = meow(
  `
	Usage
    $ mcp-cli
    $ mcp-cli --config [config.json]
    $ mcp-cli npx <package-name> <args>
    $ mcp-cli node path/to/server/index.js args...
    $ mcp-cli --url http://localhost:8000/mcp
    $ mcp-cli --sse http://localhost:8000/sse

	Options
	  --config, -c  Path to the config file
    --url         Streamable HTTP endpoint
    --sse         SSE endpoint
`,
  {
    importMeta: import.meta,
    flags: {
      config: {
        type: "string",
        shortFlag: "c",
      },
    },
  }
);

if (cli.input.length > 0) {
  const [command, ...args] = process.argv.slice(2);
  await runWithCommand(command, args);
} else if (cli.flags.url) {
  await runWithURL(cli.flags.url);
} else if (cli.flags.sse) {
  await runWithSSE(cli.flags.sse);
} else {
  await runWithConfig(cli.flags.config);
}
