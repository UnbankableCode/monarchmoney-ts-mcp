type LogLevel = "info" | "warn" | "error" | "debug";

const toConsoleMethod: Record<LogLevel, (...args: unknown[]) => void> = {
  info: (...args: unknown[]) => console.error(...args),
  warn: (...args: unknown[]) => console.error(...args),
  error: (...args: unknown[]) => console.error(...args),
  debug: (...args: unknown[]) => console.error(...args),
};

export const logger = {
  info: (...args: unknown[]) => toConsoleMethod.info(...args),
  warn: (...args: unknown[]) => toConsoleMethod.warn(...args),
  error: (...args: unknown[]) => toConsoleMethod.error(...args),
  debug: (...args: unknown[]) => toConsoleMethod.debug(...args),
};
