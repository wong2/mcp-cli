#!/usr/bin/env node

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { readFile } from "node:fs/promises";
import os from "node:os";
import prompts from "prompts";
import yoctoSpinner from "yocto-spinner";
import colors from "yoctocolors";

async function readConfig() {
  const defaultConfigFile = `${os.homedir()}/Library/Application Support/Claude/claude_desktop_config.json`;
  const configFilePath = process.argv[2] || defaultConfigFile;
  const spinner = yoctoSpinner({ text: `Loading config from ${configFilePath}` }).start();
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
  if (capabilities.resources) {
    const { resources } = await client.listResources();
    for (const item of resources) {
      primitives.push({ type: "resource", value: item });
    }
  }
  if (capabilities.tools) {
    const { tools } = await client.listTools();
    for (const item of tools) {
      primitives.push({ type: "tool", value: item });
    }
  }
  if (capabilities.prompts) {
    const { prompts } = await client.listPrompts();
    for (const item of prompts) {
      primitives.push({ type: "prompt", value: item });
    }
  }
  return primitives;
}

async function main() {
  const config = await readConfig();
  if (!config.mcpServers || Object.keys(config.mcpServers).length === 0) {
    throw new Error("No mcp servers found in config");
  }

  const server = await pickServer(config);
  const serverConfig = config.mcpServers[server];

  const spinner = yoctoSpinner({ text: "Connecting to server..." }).start();

  const client = await createClient(serverConfig);
  const primitives = await listPrimitives(client);

  spinner.success(
    `Connected to ${colors.bold(server)}, server capabilities: ${Object.keys(
      client.getServerCapabilities()
    ).join(", ")}`
  );

  const { primitive } = await prompts({
    name: "primitive",
    type: "autocomplete",
    message: "Pick a primitive",
    choices: primitives.map((p) => ({
      title: `${colors.bold(p.type + "(" + p.value.name + ")")}: ${p.value.description}`,
      value: p,
    })),
  });

  console.dir(primitive, { depth: null });
}

await main();
