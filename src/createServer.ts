#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const { MonarchClient } = require("monarchmoney");

// Configuration schema - automatically detected by Smithery
export const configSchema = z.object({
  email: z.string().email().describe("MonarchMoney email address for login"),
  password: z.string().describe("MonarchMoney password"),
  mfaSecret: z
    .string()
    .optional()
    .describe("Optional MFA/TOTP secret for two-factor authentication"),
});

type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  handler: (args: unknown) => Promise<{ content: { type: "text"; text: string }[] }>;
};

const sdkModules = [
  "accounts",
  "transactions",
  "budgets",
  "categories",
  "cashflow",
  "recurring",
  "institutions",
  "insights",
] as const;

const noArgumentMethods = new Set([
  "accounts_getAll",
  "accounts_getBalances",
  "accounts_getTypeOptions",
  "transactions_getTransactionsSummary",
  "transactions_getTransactionsSummaryCard",
  "budgets_getBudgets",
  "categories_getCategories",
  "cashflow_getCashflowSummary",
  "recurring_getRecurringStreams",
  "institutions_getInstitutions",
  "insights_getInsights",
  "get_me",
]);

export function generateInputSchema(moduleName: string, methodName: string): z.ZodTypeAny {
  const baseObject = z.object({});

  if (methodName.includes("getById") || methodName.includes("ById")) {
    return z
      .object({
        id: z.string().describe("The ID of the item to retrieve"),
      })
      .describe("ID based lookup");
  }

  if (methodName.includes("Transactions") || methodName === "getTransactions") {
    return z
      .object({
        limit: z
          .number()
          .int()
          .positive()
          .optional()
          .default(50)
          .describe("Maximum number of results (default: 50, capped at 100)"),
        offset: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .default(0)
          .describe("Pagination offset"),
        startDate: z.string().optional().describe("Start date (YYYY-MM-DD)"),
        endDate: z.string().optional().describe("End date (YYYY-MM-DD)"),
        accountIds: z.array(z.string()).optional().describe("Filter by account IDs"),
        categoryIds: z.array(z.string()).optional().describe("Filter by category IDs"),
        search: z.string().optional().describe("Search term for merchant names or descriptions"),
        absAmountRange: z
          .tuple([z.number(), z.number().nullable()])
          .optional()
          .describe("Filter by amount range [min, max]"),
        verbosity: z
          .enum(["brief", "summary", "detailed"])
          .optional()
          .default("summary")
          .describe("Output detail level"),
      })
      .describe("Transaction filter options");
  }

  if (methodName.includes("History") || methodName.includes("OverTime")) {
    return z
      .object({
        startDate: z.string().optional().describe("Start date (YYYY-MM-DD)"),
        endDate: z.string().optional().describe("End date (YYYY-MM-DD)"),
      })
      .describe("Date range options");
  }

  if (methodName.includes("create") || methodName.includes("update")) {
    return z
      .object({
        data: z.record(z.any()).describe("Data for the operation"),
      })
      .describe("Payload wrapper for create/update calls");
  }

  if (moduleName === "accounts" && methodName === "getAll") {
    return baseObject
      .extend({
        includeHidden: z.boolean().optional().describe("Include hidden accounts"),
        verbosity: z
          .enum(["brief", "summary", "detailed"])
          .optional()
          .default("summary")
          .describe("Output detail level"),
      })
      .describe("Account list options");
  }

  if ((methodName.includes("getAll") || methodName.startsWith("get")) && !methodName.includes("ById")) {
    return baseObject
      .extend({
        verbosity: z
          .enum(["brief", "summary", "detailed"])
          .optional()
          .default("summary")
          .describe("Output detail level"),
      })
      .describe("Optional verbosity");
  }

  return baseObject.describe("Optional parameters");
}

function generateMethodDescription(moduleName: string, methodName: string): string {
  const key = moduleName === "client" ? methodName : `${moduleName}_${methodName}`;
  const descriptions: Record<string, string> = {
    accounts_getAll: "Get all MonarchMoney accounts",
    accounts_getById: "Get account by ID",
    accounts_getBalanceHistory: "Get account balance history",
    accounts_getNetWorthHistory: "Get net worth history",
    transactions_getTransactions: "Get transactions with filtering options",
    transactions_getTransactionDetails: "Get detailed transaction information",
    transactions_getTransactionsSummary: "Get transactions summary",
    budgets_getBudgets: "Get budget information",
    categories_getCategories: "Get all transaction categories",
    cashflow_getCashflowSummary: "Get cashflow summary",
    recurring_getRecurringStreams: "Get recurring income/expense streams",
    institutions_getInstitutions: "Get financial institutions",
    insights_getInsights: "Get financial insights",
    get_me: "Get current user profile information",
  };

  return descriptions[key] || `Execute ${methodName} on ${moduleName} module`;
}

export function adaptArguments(toolName: string, args: Record<string, unknown>): unknown[] {
  if (noArgumentMethods.has(toolName)) {
    return [];
  }

  if (toolName.includes("getById") || toolName.includes("ById")) {
    return [args.id];
  }

  if (toolName.includes("History") || toolName.includes("NetWorth")) {
    if (!args.startDate && !args.endDate) {
      return [];
    }
    return [args];
  }

  if (toolName.includes("Transactions")) {
    const transactionArgs: Record<string, unknown> = { ...args };
    if (
      typeof transactionArgs.limit === "number" &&
      (transactionArgs.limit as number) > 100
    ) {
      transactionArgs.limit = 100;
    }

    if (!transactionArgs.startDate && !transactionArgs.endDate) {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      transactionArgs.startDate = startDate.toISOString().split("T")[0];
      transactionArgs.endDate = endDate.toISOString().split("T")[0];
    }

    return [transactionArgs];
  }

  if (toolName.includes("create") || toolName.includes("update")) {
    return [args.data];
  }

  return Object.keys(args || {}).length === 0 ? [] : [args];
}

export function formatResult(
  toolName: string,
  result: unknown,
  args: Record<string, unknown>
): string {
  const verbosity = (args?.verbosity as string) || "summary";

  if (typeof result === "string") {
    return result;
  }

  if (Array.isArray(result)) {
    if (verbosity === "brief") {
      return `${toolName} returned ${result.length} item(s)`;
    }
    return JSON.stringify(result, null, verbosity === "detailed" ? 2 : 1);
  }

  if (result && typeof result === "object") {
    const payload = verbosity === "brief" ? Object.keys(result) : result;
    return JSON.stringify(payload, null, verbosity === "detailed" ? 2 : 1);
  }

  return String(result);
}

function buildToolDefinition(
  moduleName: string,
  methodName: string,
  monarchClient: any,
  ensureAuthenticated: () => Promise<void>
): ToolDefinition {
  const toolName = moduleName === "client" ? methodName : `${moduleName}_${methodName}`;
  const inputSchema = generateInputSchema(moduleName, methodName);

  return {
    name: toolName,
    description: generateMethodDescription(moduleName, methodName),
    inputSchema,
    handler: async (rawArgs: unknown) => {
      const args = (inputSchema as z.ZodTypeAny).parse(rawArgs ?? {});
      await ensureAuthenticated();

      try {
        const target = moduleName === "client" ? monarchClient : monarchClient[moduleName];

        if (!target || typeof target[methodName] !== "function") {
          throw new Error(`Unsupported tool: ${toolName}`);
        }

        const callArgs = adaptArguments(toolName, args as Record<string, unknown>);
        const response = await target[methodName](...callArgs);
        return {
          content: [
            {
              type: "text",
              text: formatResult(toolName, response, args as Record<string, unknown>),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to execute ${toolName}: ${message}`);
      }
    },
  };
}

export function createToolDefinitions(
  monarchClient: any,
  ensureAuthenticated: () => Promise<void>
): ToolDefinition[] {
  const tools: ToolDefinition[] = [];

  sdkModules.forEach((moduleName) => {
    const moduleClient = monarchClient[moduleName];
    if (!moduleClient) return;

    const methodNames = Array.from(
      new Set([
        ...Object.getOwnPropertyNames(Object.getPrototypeOf(moduleClient)),
        ...Object.keys(moduleClient),
      ])
    ).filter((name) => name !== "constructor" && typeof moduleClient[name] === "function" && !name.startsWith("_"));

    methodNames.forEach((methodName) => {
      tools.push(buildToolDefinition(moduleName, methodName, monarchClient, ensureAuthenticated));
    });
  });

  const directMethods = Array.from(
    new Set([
      ...Object.getOwnPropertyNames(Object.getPrototypeOf(monarchClient)),
      ...Object.keys(monarchClient),
    ])
  ).filter(
    (name) =>
      name !== "constructor" &&
      typeof monarchClient[name] === "function" &&
      !name.startsWith("_") &&
      name !== "login" &&
      name !== "interactiveLogin"
  );

  directMethods.forEach((methodName) => {
    tools.push(buildToolDefinition("client", methodName, monarchClient, ensureAuthenticated));
  });

  return tools;
}

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
