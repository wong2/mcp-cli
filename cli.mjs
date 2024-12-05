#!/usr/bin/env node

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { isEmpty } from "lodash-es";
import { readFile } from "node:fs/promises";
import os from "node:os";
import prompts from "prompts";
import colors from "yoctocolors";
import {
  createSpinner,
  logger,
  prettyPrint,
  readJSONSchemaInputs,
  readPromptArgumentInputs,
} from "./utils.mjs";

async function readConfig() {
  const defaultConfigFile = `${os.homedir()}/Library/Application Support/Claude/claude_desktop_config.json`;
  const configFilePath = process.argv[2] || defaultConfigFile;
  const spinner = createSpinner(`Loading config from ${configFilePath}`);
  const config = await readFile(configFilePath, "utf-8");
  spinner.success();
  return JSON.parse(config);
}

async function pickServer(config) {
  const { server } = await prompts({
    name: "server",
    type: "autocomplete",
    message: "Pick a server",
    choices: Object.keys(config.mcpServers).map((s) => ({
      title: s,
      value: s,
    })),
  });
  return server;
}

async function createClient(serverConfig) {
  const transport = new StdioClientTransport({
    command: serverConfig.command,
    args: serverConfig.args,
    env: serverConfig.env,
  });
  const client = new Client(
    {
      name: "mcp-cli",
      version: "1.0.0",
    },
    {
      capabilities: {},
    }
  );
  await client.connect(transport);
  return client;
}

async function listPrimitives(client) {
  const capabilities = client.getServerCapabilities();
  const primitives = [];
  const promises = [];
  if (capabilities.resources) {
    promises.push(
      client.listResources().then(({ resources }) => {
        resources.forEach((item) => primitives.push({ type: "resource", value: item }));
      })
    );
  }
  if (capabilities.tools) {
    promises.push(
      client.listTools().then(({ tools }) => {
        tools.forEach((item) => primitives.push({ type: "tool", value: item }));
      })
    );
  }
  if (capabilities.prompts) {
    promises.push(
      client.listPrompts().then(({ prompts }) => {
        prompts.forEach((item) => primitives.push({ type: "prompt", value: item }));
      })
    );
  }
  await Promise.all(promises);
  return primitives;
}

async function main() {
  const config = await readConfig();
  if (!config.mcpServers || isEmpty(config.mcpServers)) {
    throw new Error("No mcp servers found in config");
  }

  const server = await pickServer(config);
  const serverConfig = config.mcpServers[server];

  const spinner = createSpinner("Connecting to server...");

  const client = await createClient(serverConfig);
  const primitives = await listPrimitives(client);

  spinner.success(
    `Connected to ${colors.bold(server)}, server capabilities: ${Object.keys(
      client.getServerCapabilities()
    ).join(", ")}`
  );

  while (true) {
    const { primitive } = await prompts(
      {
        name: "primitive",
        type: "autocomplete",
        message: "Pick a primitive",
        choices: primitives.map((p) => ({
          title: colors.bold(p.type + "(" + p.value.name + ")"),
          description: p.value.description,
          value: p,
        })),
      },
      {
        onCancel: async () => {
          await client.close();
          process.exit(0);
        },
      }
    );

    let result;
    let spinner;
    if (primitive.type === "resource") {
      spinner = createSpinner(`Reading resource ${primitive.value.uri}...`);
      result = await client.readResource({ uri: primitive.value.uri }).catch((err) => {
        spinner.error(err.message);
        spinner = undefined;
      });
    } else if (primitive.type === "tool") {
      const args = await readJSONSchemaInputs(primitive.value.inputSchema);
      spinner = createSpinner(`Using tool ${primitive.value.name}...`);
      result = await client
        .callTool({ name: primitive.value.name, arguments: args })
        .catch((err) => {
          spinner.error(err.message);
          spinner = undefined;
        });
    } else if (primitive.type === "prompt") {
      const args = await readPromptArgumentInputs(primitive.value.arguments);
      spinner = createSpinner(`Using prompt ${primitive.value.name}...`);
      result = await client
        .getPrompt({ name: primitive.value.name, arguments: args })
        .catch((err) => {
          spinner.error(err.message);
          spinner = undefined;
        });
    }
    if (spinner) {
      spinner.success();
    }
    if (result) {
      prettyPrint(result);
      logger.log("\n");
    }
  }
}

await main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
