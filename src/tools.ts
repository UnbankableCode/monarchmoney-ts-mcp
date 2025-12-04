import { z } from "zod";

const { MonarchClient } = require("monarchmoney");

export const configSchema = z.object({
  email: z.string().email().describe("MonarchMoney email address for login"),
  password: z.string().describe("MonarchMoney password"),
  mfaSecret: z
    .string()
    .optional()
    .describe("Optional MFA/TOTP secret for two-factor authentication"),
});

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  handler: (args: unknown) => Promise<{ content: { type: "text"; text: string }[] }>;
};

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
    .describe("Output detail level"),
});

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

  if (moduleName === "transactions" && methodName === "getTransactionDetails") {
    return z
      .object({
        transactionId: z.string().describe("The transaction ID to retrieve details for"),
      })
      .describe("Transaction detail lookup");
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

  if (methodName.includes("update")) {
    return z
      .object({
        id: z.string().describe("Identifier for the item to update"),
        data: z.record(z.any()).describe("Data for the operation"),
      })
      .describe("Payload wrapper for update calls");
  }

  if (methodName.includes("create")) {
    return z
      .object({
        data: z.record(z.any()).describe("Data for the operation"),
      })
      .describe("Payload wrapper for create calls");
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

export function generateMethodDescription(moduleName: string, methodName: string): string {
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

  if (toolName === "transactions_getTransactionDetails") {
    return [args.transactionId];
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

  if (toolName.includes("update")) {
    return [args.id, args.data];
  }

  if (toolName.includes("create")) {
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

export function createToolDefinitions(
  monarchClient: typeof MonarchClient.prototype,
  ensureAuthenticated: () => Promise<void>,
  formatFn: (
    toolName: string,
    result: unknown,
    args: Record<string, unknown>
  ) => string = formatResult
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
      tools.push(
        buildToolDefinition(
          moduleName,
          methodName,
          monarchClient,
          ensureAuthenticated,
          formatFn
        )
      );
    });
  });

  const hasSmartQueryTool = tools.some((tool) => tool.name === "transactions_smartQuery");

  if (monarchClient.transactions && !hasSmartQueryTool) {
    tools.push({
      name: "transactions_smartQuery",
      description:
        'Smart transaction search using natural language queries (e.g., "last 3 Amazon charges", "largest transactions this month")',
      inputSchema: smartQuerySchema,
      handler: async (rawArgs: unknown) => {
        const args = smartQuerySchema.parse(rawArgs ?? {});
        await ensureAuthenticated();

        const response =
          typeof monarchClient.transactions.smartQuery === "function"
            ? await monarchClient.transactions.smartQuery(args.query)
            : await monarchClient.transactions.getTransactions({ search: args.query, limit: 25 });

        const transactions = (response as any)?.transactions ?? response;

        return {
          content: [
            {
              type: "text",
              text: formatFn("transactions_smartQuery", transactions, args as Record<string, unknown>),
            },
          ],
        };
      },
    });
  }

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
    tools.push(
      buildToolDefinition(
        "client",
        methodName,
        monarchClient,
        ensureAuthenticated,
        formatFn
      )
    );
  });

  return tools;
}

function buildToolDefinition(
  moduleName: string,
  methodName: string,
  monarchClient: typeof MonarchClient.prototype,
  ensureAuthenticated: () => Promise<void>,
  formatFn: (
    toolName: string,
    result: unknown,
    args: Record<string, unknown>
  ) => string
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

      const target = moduleName === "client" ? monarchClient : monarchClient[moduleName];

      if (!target || typeof target[methodName] !== "function") {
        throw new Error(`Unsupported tool: ${toolName}`);
      }

      try {
        const callArgs = adaptArguments(toolName, args as Record<string, unknown>);
        const response = await target[methodName](...callArgs);
        return {
          content: [
            {
              type: "text",
              text: formatFn(toolName, response, args as Record<string, unknown>),
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
