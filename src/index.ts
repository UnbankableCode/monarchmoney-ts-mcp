#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { getEnvConfig } from "./config";
import { createToolDefinitions, ToolDefinition } from "./tools";
import { formatResult as formatMonarchResult } from "./formatters/monarch";
import { logger } from "./logger";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { MonarchClient } = require("monarchmoney");

const smartQuerySchema = z.object({
  query: z
    .string()
    .describe(
      'Natural language query (e.g., "last 5 Amazon purchases", "biggest transactions this month", "Starbucks charges over $10")'
    ),
  verbosity: z
    .enum(["brief", "summary", "detailed"])
    .optional()
    .default("summary")
    .describe("Output detail level: brief, summary (default), or detailed"),
});

const summaryToolSchemas = {
  spending_getByCategoryMonth: z.object({
    month: z.string().optional().describe("Month in YYYY-MM format (defaults to current month)"),
    topN: z
      .number()
      .optional()
      .default(10)
      .describe("Number of top categories to show (default: 10)"),
  }),
  accounts_getBalanceTrends: z.object({
    period: z
      .enum(["week", "month", "quarter"])
      .optional()
      .default("month")
      .describe("Period for balance comparison"),
  }),
  budget_getVarianceSummary: z.object({
    month: z.string().optional().describe("Month in YYYY-MM format (defaults to current month)"),
  }),
  insights_getQuickStats: z.object({}),
} as const;

type SummaryToolName = keyof typeof summaryToolSchemas;

type SummaryHandler = (args: Record<string, unknown>) => Promise<string>;

function parseNaturalLanguageQuery(query: string): Record<string, unknown> {
  const enhancedArgs: Record<string, unknown> = {};
  const lowerQuery = query.toLowerCase();

  const numberMatch = lowerQuery.match(
    /(?:last|recent|top|first)\s+(\d+)|(\d+)\s+(?:last|recent|top|largest|biggest|smallest)/
  );
  if (numberMatch) {
    const number = parseInt(numberMatch[1] || numberMatch[2], 10);
    if (!Number.isNaN(number) && number <= 100) {
      enhancedArgs.limit = number;
    }
  }

  const merchantPatterns = [
    { pattern: /amazon|amzn/i, search: "amazon" },
    { pattern: /walmart|wal-mart/i, search: "walmart" },
    { pattern: /target/i, search: "target" },
    { pattern: /costco/i, search: "costco" },
    { pattern: /starbucks/i, search: "starbucks" },
    { pattern: /mcdonalds|mcdonald's/i, search: "mcdonalds" },
    { pattern: /netflix/i, search: "netflix" },
    { pattern: /spotify/i, search: "spotify" },
    { pattern: /uber|lyft/i, search: "uber" },
    { pattern: /apple|app store/i, search: "apple" },
    { pattern: /google|youtube/i, search: "google" },
    { pattern: /gas\s+station|gasoline|fuel/i, search: "gas" },
    { pattern: /restaurant|dining|food/i, search: "restaurant" },
    { pattern: /grocery|groceries/i, search: "grocery" },
    { pattern: /subscription|subscriptions/i, search: "subscription" },
  ];

  for (const { pattern, search } of merchantPatterns) {
    if (pattern.test(lowerQuery)) {
      enhancedArgs.search = search;
      break;
    }
  }

  if (lowerQuery.includes("this month")) {
    const now = new Date();
    enhancedArgs.startDate = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split("T")[0];
    enhancedArgs.endDate = now.toISOString().split("T")[0];
  } else if (lowerQuery.includes("last month")) {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    enhancedArgs.startDate = lastMonth.toISOString().split("T")[0];
    enhancedArgs.endDate = lastMonthEnd.toISOString().split("T")[0];
  } else if (lowerQuery.includes("this week")) {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    enhancedArgs.startDate = startOfWeek.toISOString().split("T")[0];
    enhancedArgs.endDate = now.toISOString().split("T")[0];
  }

  const amountMatch = lowerQuery.match(
    /(?:over|above|more than)\s*\$?(\d+(?:,\d{3})*(?:\.\d{2})?)|(?:under|below|less than)\s*\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/
  );
  if (amountMatch) {
    const amount = parseFloat((amountMatch[1] || amountMatch[2]).replace(/,/g, ""));
    if (!Number.isNaN(amount)) {
      if (lowerQuery.includes("over") || lowerQuery.includes("above") || lowerQuery.includes("more than")) {
        enhancedArgs.absAmountRange = [amount, undefined];
      } else {
        enhancedArgs.absAmountRange = [undefined, amount];
      }
    }
  }

  if (lowerQuery.includes("largest") || lowerQuery.includes("biggest") || lowerQuery.includes("highest")) {
    enhancedArgs._sortByAmount = "desc";
  } else if (lowerQuery.includes("smallest") || lowerQuery.includes("lowest")) {
    enhancedArgs._sortByAmount = "asc";
  }

  logger.info(`🔍 Parsed smart query "${query}"`, JSON.stringify(enhancedArgs));

  return enhancedArgs;
}

async function handleSmartTransactionQuery(monarchClient: any, query: string) {
  const parsedArgs = parseNaturalLanguageQuery(query);

  const transactionArgs: Record<string, unknown> = {
    search: parsedArgs.search,
    limit: (parsedArgs.limit as number | undefined) || 25,
    startDate: parsedArgs.startDate,
    endDate: parsedArgs.endDate,
    absAmountRange: parsedArgs.absAmountRange,
    _sortByAmount: parsedArgs._sortByAmount,
    _originalQuery: query,
  };

  Object.keys(transactionArgs).forEach((key) => {
    if (transactionArgs[key] === undefined) {
      delete transactionArgs[key];
    }
  });

  logger.info("🎯 Executing smart query", JSON.stringify(transactionArgs));

  const paginatedResult = await monarchClient.transactions.getTransactions(transactionArgs);
  const transactions = paginatedResult.transactions || [];
  (transactions as any)._smartQueryArgs = parsedArgs;
  (transactions as any)._originalQuery = query;

  return transactions;
}

async function getSpendingByCategory(monarchClient: any, args: Record<string, unknown>): Promise<string> {
  const month = (args.month as string | undefined) || new Date().toISOString().substring(0, 7);
  const topN = (args.topN as number | undefined) || 10;

  const startDate = `${month}-01`;
  const endDate = new Date(`${month}-01`);
  endDate.setMonth(endDate.getMonth() + 1);
  endDate.setDate(0);

  const result = await monarchClient.transactions.getTransactions({
    startDate,
    endDate: endDate.toISOString().substring(0, 10),
    limit: 1000,
  });

  const transactions = result.transactions || [];
  const categoryTotals: Record<string, number> = {};
  transactions.forEach((txn: any) => {
    if (txn.amount < 0) {
      const category = txn.category?.name || "Uncategorized";
      categoryTotals[category] = (categoryTotals[category] || 0) + Math.abs(txn.amount);
    }
  });

  const sortedCategories = Object.entries(categoryTotals)
    .sort(([, a], [, b]) => b - a)
    .slice(0, topN);

  const totalSpending = sortedCategories.reduce((sum, [, amount]) => sum + amount, 0);

  return `💸 ${month} Spending: ${sortedCategories
    .map(([cat, amt]) => `${cat} $${amt.toFixed(0)}`)
    .join(", ")} | Total: $${totalSpending.toFixed(0)}`;
}

async function getBalanceTrends(monarchClient: any, args: Record<string, unknown>): Promise<string> {
  const period = (args.period as string | undefined) || "month";
  const accounts = await monarchClient.accounts.getAll();

  const changes = accounts.map((account: any) => {
    const balance = account.currentBalance || account.displayBalance || 0;
    const prevBalance = period === "week" ? account.balanceOneWeekAgo : account.balanceOneMonthAgo || 0;
    const delta = balance - (prevBalance || 0);
    return `${account.displayName || account.name}: ${delta >= 0 ? "+" : "-"}$${Math.abs(delta).toLocaleString()}`;
  });

  return `📈 Balance changes (${period}): ${changes.join(", ")}`;
}

async function getBudgetVarianceSummary(monarchClient: any, args: Record<string, unknown>): Promise<string> {
  const month = (args.month as string | undefined) || new Date().toISOString().substring(0, 7);

  try {
    const budgets = await monarchClient.budgets.getBudgets({ month });

    let overBudget = 0;
    let onTrack = 0;
    let underBudget = 0;

    budgets.forEach((budget: any) => {
      const spent = budget.actual || budget.spent || 0;
      const limit = budget.budgeted || budget.limit || 0;
      if (spent > limit) {
        overBudget += 1;
      } else if (spent > 0.8 * limit) {
        onTrack += 1;
      } else {
        underBudget += 1;
      }
    });

    return `💰 Budget Status: ${overBudget} over budget, ${onTrack} on track, ${underBudget} under budget`;
  } catch (error) {
    logger.error("Failed to compute budget variance", error);
    return "💰 Budget data unavailable";
  }
}

async function getQuickStats(monarchClient: any): Promise<string> {
  const [accounts, transactions] = await Promise.all([
    monarchClient.accounts.getAll(),
    monarchClient.transactions.getTransactions({ limit: 100 }),
  ]);

  const totalBalance = accounts.reduce(
    (sum: number, acc: any) => sum + (acc.currentBalance || 0),
    0
  );
  const recentTransactions = transactions.transactions?.length || 0;
  const thisMonthSpending =
    transactions.transactions
      ?.filter((t: any) => t.amount < 0 && new Date(t.date).getMonth() === new Date().getMonth())
      .reduce((sum: number, t: any) => sum + Math.abs(t.amount), 0) || 0;

  return `⚡ Net Worth: $${totalBalance.toLocaleString()} | This Month: -$${thisMonthSpending.toFixed(
    0
  )} | ${recentTransactions} recent transactions`;
}

async function main() {
  const server = new Server({
    name: "monarchmoney-mcp",
    version: "1.0.0",
  });

  const monarchClient = new MonarchClient({
    baseURL: "https://api.monarchmoney.com",
    timeout: 30000,
  });

  let isAuthenticated = false;

  const ensureAuthenticated = async () => {
    if (isAuthenticated) {
      return;
    }

    try {
      const config = getEnvConfig();
      logger.info(`🔐 Attempting authentication for: ${config.email}`);

      await monarchClient.login({
        email: config.email,
        password: config.password,
        mfaSecretKey: config.mfaSecret,
      });

      isAuthenticated = true;
      logger.info(`✅ Successfully authenticated: ${config.email}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const details =
        (error as any)?.details ||
        (error instanceof Error && error.stack ? error.stack.split("\n")[0] : undefined);

      logger.error("Authentication failed", { message, details });

      if (message.includes("Forbidden")) {
        throw new McpError(
          ErrorCode.InternalError,
          "🚫 AUTH ERROR: Invalid email/password combination."
        );
      }

      if (message.includes("401")) {
        throw new McpError(
          ErrorCode.InternalError,
          "🔑 AUTH ERROR: Unauthorized - verify your MonarchMoney credentials."
        );
      }

      if (message.includes("429")) {
        throw new McpError(
          ErrorCode.InternalError,
          "⏳ RATE LIMITED: Too many login attempts. Please wait before retrying."
        );
      }

      if (message.toLowerCase().includes("mfa") || message.toLowerCase().includes("totp")) {
        throw new McpError(
          ErrorCode.InternalError,
          "🔐 MFA ERROR: Multi-Factor Authentication required. Configure your TOTP secret."
        );
      }

      if (message.toLowerCase().includes("network") || message.toLowerCase().includes("timeout")) {
        throw new McpError(
          ErrorCode.InternalError,
          "🌐 NETWORK ERROR: Unable to connect to MonarchMoney servers."
        );
      }

      throw new McpError(ErrorCode.InternalError, `❌ LOGIN FAILED: ${message || "Unknown error"}`);
    }
  };

  const toolDefinitions: ToolDefinition[] = [
    ...createToolDefinitions(monarchClient, ensureAuthenticated, formatMonarchResult),
    {
      name: "transactions_smartQuery",
      description:
        'Smart transaction search using natural language queries (e.g., "last 3 Amazon charges", "largest transactions this month")',
      inputSchema: smartQuerySchema,
      handler: async (args) => {
        const parsed = smartQuerySchema.parse(args);
        await ensureAuthenticated();
        const result = await handleSmartTransactionQuery(monarchClient, parsed.query);
        return {
          content: [
            {
              type: "text",
              text: formatMonarchResult("transactions_smartQuery", result, parsed),
            },
          ],
        };
      },
    },
  ];

  const summaryHandlers: Record<SummaryToolName, SummaryHandler> = {
    spending_getByCategoryMonth: (args) => getSpendingByCategory(monarchClient, args),
    accounts_getBalanceTrends: (args) => getBalanceTrends(monarchClient, args),
    budget_getVarianceSummary: (args) => getBudgetVarianceSummary(monarchClient, args),
    insights_getQuickStats: () => getQuickStats(monarchClient),
  };

  (Object.keys(summaryToolSchemas) as SummaryToolName[]).forEach((name) => {
    const schema = summaryToolSchemas[name];
    const handler = summaryHandlers[name];
    toolDefinitions.push({
      name,
      description: summaryDescription(name),
      inputSchema: schema,
      handler: async (args) => {
        const parsed = schema.parse(args ?? {});
        await ensureAuthenticated();
        const result = await handler(parsed);
        return { content: [{ type: "text", text: result }] };
      },
    });
  });

  const toolsMap = new Map(toolDefinitions.map((tool) => [tool.name, tool]));

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolDefinitions.map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const tool = toolsMap.get(name);

    if (!tool) {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }

    try {
      return await tool.handler(args ?? {});
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Tool ${name} failed`, error);
      throw new McpError(ErrorCode.InternalError, `Tool ${name} failed: ${message}`);
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("🚀 MonarchMoney MCP server running on stdio");
  logger.info("📋 Waiting for client connection...");
}

function summaryDescription(name: SummaryToolName): string {
  const descriptions: Record<SummaryToolName, string> = {
    spending_getByCategoryMonth:
      "Get spending breakdown by category for a month (compact summary)",
    accounts_getBalanceTrends: "Get account balance changes summary (gains/losses)",
    budget_getVarianceSummary: "Get budget vs actual spending summary",
    insights_getQuickStats: "Get key financial metrics in compact format",
  };

  return descriptions[name];
}

main().catch((error) => {
  logger.error("Fatal error in main()", error);
  process.exit(1);
});
