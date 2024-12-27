#!/usr/bin/env node

import meow from "meow";
import { runServer, runWithConfig } from "./mcp.js";

const cli = meow(
  `
	Usage
    $ mcp-cli
    $ mcp-cli -c [config.json]
    $ mcp-cli npx <package-name> <args>
    $ mcp-cli node path/to/server/index.js args...

	Options
	  --config, -c  Path to the config file
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
  const [command, ...args] = cli.input;
  await runServer({ command, args });
} else {
  await runWithConfig(cli.flags.config);
}
