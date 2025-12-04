#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const { MonarchClient } = require("monarchmoney");
import { configSchema, createToolDefinitions } from "./tools";

export {
  adaptArguments,
  createToolDefinitions,
  formatResult,
  generateInputSchema,
} from "./tools";

/**
 * MonarchMoney MCP Server
 *
 * This MCP server integrates with MonarchMoney API to provide financial data access.
 * Features include account summaries, transaction history, budget tracking, and AI-optimized responses.
 */
export default function createServer({
  config,
  client,
}: {
  config: z.infer<typeof configSchema>;
  client?: any;
}) {
  const server = new McpServer({
    name: "monarchmoney-mcp",
    title: "MonarchMoney Financial Data",
    version: "1.2.0",
  });

  const monarchClient =
    client ||
    new MonarchClient({
      baseURL: "https://api.monarchmoney.com",
      timeout: 30000,
    });

  let isAuthenticated = false;

  const ensureAuthenticated = async () => {
    if (isAuthenticated) return;

    if (!config.email || !config.password) {
      throw new Error(
        "MonarchMoney credentials are required. Please configure email and password in the server settings."
      );
    }

    try {
      await monarchClient.login({
        email: config.email,
        password: config.password,
        mfaSecretKey: config.mfaSecret,
      });
      isAuthenticated = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      let hint = "";

      if (message.includes("Forbidden") || message.includes("401")) {
        hint = "Invalid credentials. Please verify your email, password, and MFA settings.";
      } else if (message.includes("429")) {
        hint = "Rate limited. Please wait before retrying.";
      } else if (message.toLowerCase().includes("network")) {
        hint = "Network error. Check your internet connection.";
      }

      throw new Error(`MonarchMoney authentication failed: ${message}${hint ? ` (${hint})` : ""}`);
    }
  };

  const toolDefinitions = createToolDefinitions(monarchClient, ensureAuthenticated);

  toolDefinitions.forEach((tool) => {
    // Casts are used here to align with MCP server typings while allowing dynamic schemas
    server.tool(tool.name, tool.description, tool.inputSchema as any, tool.handler as any);
  });

  // Return the server object (Smithery CLI handles transport)
  const transportServer = server.server as any;
  transportServer.tools = toolDefinitions;
  return transportServer;
}
