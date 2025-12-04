type Verbosity = "brief" | "summary" | "detailed";

export function formatAccounts(accounts: any[], verbosity: Verbosity = "summary"): string {
  if (verbosity === "brief") {
    const totalBalance = accounts.reduce((sum: number, acc: any) => sum + (acc.currentBalance || 0), 0);
    return `🏦 ${accounts.length} accounts, Total Balance: $${totalBalance.toLocaleString()}`;
  }

  if (verbosity === "detailed") {
    return (
      `🏦 **Accounts** (${accounts.length} total)\n\n` +
      accounts
        .map(
          (account) =>
            `• **${account.displayName || account.name}**\n  Type: ${
              account.type?.display || account.subtype?.display || "Unknown"
            }\n  Balance: $${(account.currentBalance || account.displayBalance || 0).toLocaleString()}\n  Institution: ${
              account.institution?.name || "Manual"
            }`
        )
        .join("\n\n")
    );
  }

  const totalBalance = accounts.reduce((sum: number, acc: any) => sum + (acc.currentBalance || 0), 0);
  const hiddenCount = accounts.filter((acc: any) => acc.isHidden).length;

  return (
    `🏦 **Accounts** (${accounts.length} total, ${hiddenCount} hidden)\n\n` +
    accounts
      .slice(0, 15)
      .map(
        (account) =>
          `• **${account.displayName || account.name}** (${account.type?.display || account.subtype?.display || "Unknown"}) - $${
            (account.currentBalance || account.displayBalance || 0).toLocaleString()
          }`
      )
      .join("\n") +
    (accounts.length > 15 ? `\n... and ${accounts.length - 15} more accounts` : "") +
    `\n\n**Total Balance: $${totalBalance.toLocaleString()}**`
  );
}

export function formatTransactions(transactions: any[], originalArgs?: any): string {
  let processedTransactions = [...transactions];
  const verbosity: Verbosity = originalArgs?.verbosity || "summary";

  if (originalArgs?._sortByAmount) {
    processedTransactions.sort((a, b) => {
      const amountA = Math.abs(a.amount || 0);
      const amountB = Math.abs(b.amount || 0);
      return originalArgs._sortByAmount === "desc" ? amountB - amountA : amountA - amountB;
    });
  }

  let totalAmount = 0;
  processedTransactions.forEach((txn) => {
    totalAmount += Math.abs(txn.amount || 0);
  });

  if (verbosity === "brief") {
    return `💳 ${processedTransactions.length} transactions, Total: $${totalAmount.toLocaleString()}`;
  }

  if (verbosity === "detailed") {
    const summary = `💳 **Transaction Summary** (${processedTransactions.length} transactions)\n\n`;
    const displayCount = Math.min(25, processedTransactions.length);

    const formatted = processedTransactions
      .slice(0, displayCount)
      .map((txn, index) => {
        const amount = txn.amount || 0;
        const date = txn.date ? new Date(txn.date).toLocaleDateString() : "Unknown date";
        const merchant = txn.merchantName || txn.description || "Unknown merchant";
        const category = txn.category?.name || "Uncategorized";
        const ranking = originalArgs?._sortByAmount ? `${index + 1}. ` : "• ";

        return `${ranking}${date} - **${merchant}**
  Amount: ${amount >= 0 ? "+" : "-"}$${Math.abs(amount).toLocaleString()}
  Category: ${category}
  Account: ${txn.account?.displayName || "Unknown"}
  ID: ${txn.id || "N/A"}
  ${txn.notes ? `Notes: ${txn.notes}` : ""}`;
      })
      .join("\n\n");

    return (
      summary +
      formatted +
      (processedTransactions.length > displayCount
        ? `\n\n... and ${processedTransactions.length - displayCount} more transactions`
        : "") +
      `\n\n**Total Transaction Volume: $${totalAmount.toLocaleString()}**`
    );
  }

  const summary = `💳 **Transaction Summary** (${processedTransactions.length} transactions)\n\n`;
  const displayCount = Math.min(20, processedTransactions.length);

  const formatted = processedTransactions
    .slice(0, displayCount)
    .map((txn, index) => {
      const amount = txn.amount || 0;
      const date = txn.date ? new Date(txn.date).toLocaleDateString() : "Unknown date";
      const merchant = txn.merchantName || txn.description || "Unknown merchant";
      const category = txn.category?.name || "Uncategorized";
      const ranking = originalArgs?._sortByAmount ? `${index + 1}. ` : "• ";

      return `${ranking}${date} - **${merchant}**
  Amount: ${amount >= 0 ? "+" : "-"}$${Math.abs(amount).toLocaleString()}
  Category: ${category}
  Account: ${txn.account?.displayName || "Unknown"}`;
    })
    .join("\n\n");

  return (
    summary +
    formatted +
    (processedTransactions.length > displayCount
      ? `\n\n... and ${processedTransactions.length - displayCount} more transactions`
      : "") +
    `\n\n**Total Transaction Volume: $${totalAmount.toLocaleString()}**`
  );
}

export function formatCategories(categories: any[], verbosity: Verbosity = "summary"): string {
  if (verbosity === "brief") {
    return `🏷️ ${categories.length} categories`;
  }

  if (verbosity === "detailed") {
    return (
      `🏷️ **Categories** (${categories.length} total)\n\n` +
      categories
        .map(
          (cat) =>
            `• **${cat.name}** ${cat.group ? `(${cat.group.name})` : ""}\n  ID: ${cat.id || "N/A"}`
        )
        .join("\n\n")
    );
  }

  return (
    `🏷️ **Categories** (${categories.length} total)\n\n` +
    categories
      .slice(0, 15)
      .map((cat) => `• **${cat.name}** ${cat.group ? `(${cat.group.name})` : ""}`)
      .join("\n") +
    (categories.length > 15 ? `\n... and ${categories.length - 15} more categories` : "")
  );
}

export function formatBudgets(budgets: any[], verbosity: Verbosity = "summary"): string {
  if (verbosity === "brief") {
    const totalBudgeted = budgets.reduce((sum, b) => sum + (b.budgeted || b.limit || 0), 0);
    const totalSpent = budgets.reduce((sum, b) => sum + (b.actual || b.spent || 0), 0);
    return `💰 ${budgets.length} budget categories, $${totalSpent.toLocaleString()}/$${totalBudgeted.toLocaleString()} spent`;
  }

  if (verbosity === "detailed") {
    return (
      `💰 **Budget Summary** (${budgets.length} categories)\n\n` +
      budgets
        .map((budget) => {
          const spent = budget.actual || budget.spent || 0;
          const budgeted = budget.budgeted || budget.limit || 0;
          const remaining = budgeted - spent;
          const percentage = budgeted > 0 ? Math.round((spent / budgeted) * 100) : 0;

          return `• **${budget.category?.name || budget.name}**
  Budgeted: $${budgeted.toLocaleString()}
  Spent: $${spent.toLocaleString()} (${percentage}%)
  Remaining: $${remaining.toLocaleString()}
  ID: ${budget.id || "N/A"}`;
        })
        .join("\n\n")
    );
  }

  return (
    `💰 **Budget Summary** (${budgets.length} categories)\n\n` +
    budgets
      .slice(0, 10)
      .map((budget) => {
        const spent = budget.actual || budget.spent || 0;
        const budgeted = budget.budgeted || budget.limit || 0;
        const remaining = budgeted - spent;
        const percentage = budgeted > 0 ? Math.round((spent / budgeted) * 100) : 0;

        return `• **${budget.category?.name || budget.name}**
  Budgeted: $${budgeted.toLocaleString()}
  Spent: $${spent.toLocaleString()} (${percentage}%)
  Remaining: $${remaining.toLocaleString()}`;
      })
      .join("\n\n") +
    (budgets.length > 10 ? `\n\n... and ${budgets.length - 10} more budget categories` : "")
  );
}

export function formatSummary(data: any): string {
  const lines = [];

  if (data.totalIncome !== undefined) lines.push(`💰 Total Income: $${data.totalIncome.toLocaleString()}`);
  if (data.totalExpenses !== undefined) lines.push(`💸 Total Expenses: $${data.totalExpenses.toLocaleString()}`);
  if (data.netIncome !== undefined) lines.push(`📈 Net Income: $${data.netIncome.toLocaleString()}`);
  if (data.totalTransactions !== undefined) lines.push(`📊 Total Transactions: ${data.totalTransactions.toLocaleString()}`);

  return lines.join("\n");
}

export function formatAccount(account: any): string {
  return `📊 **${account.displayName || account.name}**
Type: ${account.type?.display || account.subtype?.display || "Unknown"}
Balance: $${(account.currentBalance || account.displayBalance || 0).toLocaleString()}
Institution: ${account.institution?.name || "Manual"}
Updated: ${account.displayLastUpdatedAt ? new Date(account.displayLastUpdatedAt).toLocaleDateString() : "Unknown"}`;
}

export function getRelevantFields(obj: any): any {
  const relevant: any = {};
  const importantKeys = [
    "id",
    "name",
    "displayName",
    "amount",
    "balance",
    "currentBalance",
    "displayBalance",
    "date",
    "description",
    "category",
    "type",
    "status",
    "total",
    "count",
  ];

  importantKeys.forEach((key) => {
    if (obj[key] !== undefined) {
      relevant[key] = obj[key];
    }
  });

  return relevant;
}

export function formatObjectResult(toolName: string, data: any): string {
  if (data.totalIncome !== undefined || data.totalExpenses !== undefined) {
    return formatSummary(data);
  }

  if (data.currentBalance !== undefined) {
    return formatAccount(data);
  }

  const relevantFields = getRelevantFields(data);
  const serialized = Object.entries(relevantFields)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");

  return serialized || `${toolName} returned an object`;
}

export function formatArrayResult(toolName: string, data: any[], originalArgs?: any): string {
  if (data.length === 0) {
    return `No ${toolName.replace(/.*_/, "")} found.`;
  }

  const verbosity: Verbosity = originalArgs?.verbosity || "summary";

  if (toolName.includes("accounts")) {
    return formatAccounts(data, verbosity);
  }

  if (toolName.includes("transactions") || toolName === "transactions_smartQuery") {
    const smartArgs = { ...(data as any)._smartQueryArgs, ...originalArgs };
    const query = (data as any)._originalQuery;
    const formatted = formatTransactions(data, smartArgs);

    if (query) {
      return `🧠 **Smart Query**: "${query}"\n\n${formatted}`;
    }

    return formatted;
  }

  if (toolName.includes("categories")) {
    return formatCategories(data, verbosity);
  }

  if (toolName.includes("budgets")) {
    return formatBudgets(data, verbosity);
  }

  return (
    `Found ${data.length} items:\n` +
    data
      .slice(0, 10)
      .map((item, i) => `${i + 1}. ${JSON.stringify(item, null, 2)}`)
      .join("\n") +
    (data.length > 10 ? `\n... and ${data.length - 10} more items` : "")
  );
}

export function formatResult(toolName: string, result: any, originalArgs?: any): string {
  if (!result) {
    return `No data returned for ${toolName}`;
  }

  const summaryTools = [
    "spending_getByCategoryMonth",
    "accounts_getBalanceTrends",
    "budget_getVarianceSummary",
    "insights_getQuickStats",
  ];

  if (summaryTools.includes(toolName)) {
    return String(result);
  }

  if (Array.isArray(result)) {
    return formatArrayResult(toolName, result, originalArgs);
  }

  if (typeof result === "object") {
    return formatObjectResult(toolName, result);
  }

  return String(result);
}
