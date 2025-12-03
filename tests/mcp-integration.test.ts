jest.mock("monarchmoney", () => ({ MonarchClient: jest.fn(() => ({})) }));

import createServer, {
  adaptArguments,
  createToolDefinitions,
  formatResult,
  generateInputSchema,
} from "../src/createServer";

const mockAccounts = [
  {
    id: "1",
    displayName: "Checking",
    currentBalance: 100,
  },
  {
    id: "2",
    displayName: "Savings",
    currentBalance: 250,
  },
];

class MockAccounts {
  getAll = jest.fn().mockResolvedValue(mockAccounts);
  getById = jest.fn().mockResolvedValue(mockAccounts[0]);
}

class MockTransactions {
  getTransactions = jest.fn().mockResolvedValue({ transactions: [] });
  smartQuery = jest.fn().mockResolvedValue({ transactions: [{ id: "t1" }] });
}

class MockClient {
  accounts = new MockAccounts();
  transactions = new MockTransactions();
  budgets = { getBudgets: jest.fn().mockResolvedValue([]) };
  categories = { getCategories: jest.fn().mockResolvedValue([]) };
  cashflow = { getCashflowSummary: jest.fn().mockResolvedValue({}) };
  recurring = { getRecurringStreams: jest.fn().mockResolvedValue([]) };
  institutions = { getInstitutions: jest.fn().mockResolvedValue([]) };
  insights = { getInsights: jest.fn().mockResolvedValue([]) };
  get_me = jest.fn().mockResolvedValue({ email: "test@example.com" });
  login = jest.fn().mockResolvedValue(undefined);
}

describe("Dynamic MCP tool discovery", () => {
  test("collects tools from SDK modules, smart query, and direct client methods", () => {
    const mockClient = new MockClient();
    const ensureAuthenticated = jest.fn();

    const tools = createToolDefinitions(mockClient, ensureAuthenticated);
    const toolNames = tools.map((tool) => tool.name);

    expect(toolNames).toEqual(
      expect.arrayContaining([
        "accounts_getAll",
        "accounts_getById",
        "transactions_getTransactions",
        "transactions_smartQuery",
        "budgets_getBudgets",
        "categories_getCategories",
        "cashflow_getCashflowSummary",
        "recurring_getRecurringStreams",
        "institutions_getInstitutions",
        "insights_getInsights",
        "get_me",
      ])
    );
  });

  test("handlers invoke SDK methods and wrap results", async () => {
    const mockClient = new MockClient();
    const ensureAuthenticated = jest.fn();
    const tools = createToolDefinitions(mockClient, ensureAuthenticated);
    const getAllTool = tools.find((tool) => tool.name === "accounts_getAll");

    expect(getAllTool).toBeDefined();
    const response = await getAllTool!.handler({});

    expect(ensureAuthenticated).toHaveBeenCalled();
    expect(mockClient.accounts.getAll).toHaveBeenCalled();
    expect(response.content[0].text).toContain("Checking");
  });

  test("input schemas include defaults for transactions", () => {
    const schema = generateInputSchema("transactions", "getTransactions");
    const parsed = schema.parse({});

    expect(parsed.limit).toBe(50);
    expect(parsed.offset).toBe(0);
    expect(parsed.verbosity).toBe("summary");
  });

  test("accounts schema preserves additional options", () => {
    const schema = generateInputSchema("accounts", "getAll");
    const parsed = schema.parse({ includeHidden: true });

    expect(parsed.includeHidden).toBe(true);
    expect(parsed.verbosity).toBe("summary");
  });

  test("createServer reuses authentication flow across handlers", async () => {
    const mockClient = new MockClient();
    const server = createServer({
      config: { email: "test@example.com", password: "secret" },
      client: mockClient,
    });

    const toolNames = server.tools?.map((t: any) => t.name) ?? [];
    expect(toolNames).toContain("accounts_getAll");

    const accountsTool = server.tools.find((tool: any) => tool.name === "accounts_getAll");
    await accountsTool.handler({});
    await accountsTool.handler({});

    expect(mockClient.login).toHaveBeenCalledTimes(1);
  });
});

describe("Verbosity level handling", () => {
  test("produces compact summaries for arrays when brief", () => {
    const text = formatResult("accounts_getAll", mockAccounts, { verbosity: "brief" });
    expect(text).toContain("returned 2 item(s)");
  });

  test("returns structured output for detailed verbosity", () => {
    const text = formatResult("accounts_getAll", mockAccounts[0], { verbosity: "detailed" });
    expect(text).toContain("\n");
    expect(text).toContain("Checking");
  });
});

describe("Argument adaptation", () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2024-02-01T00:00:00Z"));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  test("reduces getById payloads to identifiers", () => {
    const args = adaptArguments("accounts_getById", { id: "abc" });
    expect(args).toEqual(["abc"]);
  });

  test("applies defaults for transactions and caps excessive limits", async () => {
    const mockClient = new MockClient();
    const tools = createToolDefinitions(mockClient, async () => {});
    const transactionsTool = tools.find((tool) => tool.name === "transactions_getTransactions");

    await transactionsTool!.handler({ limit: 500 });

    expect(mockClient.transactions.getTransactions).toHaveBeenCalledWith({
      limit: 100,
      offset: 0,
      startDate: "2024-01-02",
      endDate: "2024-02-01",
      verbosity: "summary",
    });
  });
});

describe("Error handling", () => {
  test("wraps SDK failures with friendly messaging", async () => {
    const mockClient = new MockClient();
    mockClient.accounts.getAll.mockRejectedValue(new Error("boom"));

    const tools = createToolDefinitions(mockClient, async () => {});
    const accountsTool = tools.find((tool) => tool.name === "accounts_getAll");

    await expect(accountsTool!.handler({})).rejects.toThrow(
      "Failed to execute accounts_getAll: boom"
    );
  });
});
