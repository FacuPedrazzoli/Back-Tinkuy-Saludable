type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

const LOG_LEVEL = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug");
const CURRENT_LEVEL: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

const configLevel = LOG_LEVEL as LogLevel;
const configPriority = CURRENT_LEVEL[configLevel] ?? 1;

function formatLog(level: LogLevel, bindings: Record<string, unknown>, message: string, error?: unknown): string {
  const timestamp = new Date().toISOString();
  const base = {
    service: "back-tinkuy-saludable",
    env: process.env.NODE_ENV ?? "development",
    timestamp,
    level,
    ...bindings,
  };

  const logObject = error
    ? { ...base, msg: message, err: formatError(error) }
    : { ...base, msg: message };

  return JSON.stringify(logObject);
}

function formatError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      message: err.message,
      stack: err.stack,
      name: err.name,
    };
  }
  return { message: String(err) };
}

function shouldLog(level: LogLevel): boolean {
  return CURRENT_LEVEL[level] >= configPriority;
}

export const logger = {
  debug(bindings: Record<string, unknown>, message: string): void {
    if (shouldLog("debug")) {
      console.debug(formatLog("debug", bindings, message));
    }
  },

  info(bindings: Record<string, unknown>, message: string): void {
    if (shouldLog("info")) {
      console.info(formatLog("info", bindings, message));
    }
  },

  warn(bindings: Record<string, unknown>, message: string): void {
    if (shouldLog("warn")) {
      console.warn(formatLog("warn", bindings, message));
    }
  },

  error(bindings: Record<string, unknown>, message: string, err?: unknown): void {
    if (shouldLog("error")) {
      console.error(formatLog("error", bindings, message, err));
    }
  },

  fatal(bindings: Record<string, unknown>, message: string, err?: unknown): void {
    if (shouldLog("fatal")) {
      console.error(formatLog("fatal", bindings, message, err));
    }
  },
};

export function createChildLogger(bindings: Record<string, unknown>) {
  return {
    debug(msg: string): void {
      logger.debug(bindings, msg);
    },
    info(msg: string): void {
      logger.info(bindings, msg);
    },
    warn(msg: string): void {
      logger.warn(bindings, msg);
    },
    error(msg: string, err?: unknown): void {
      logger.error(bindings, msg, err);
    },
    fatal(msg: string, err?: unknown): void {
      logger.fatal(bindings, msg, err);
    },
  };
}
