export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

// Basic no-op to avoid optional chaining overhead in hot paths
const noop = (..._args: unknown[]) => {};

export interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

const levelOrder: Record<Exclude<LogLevel, 'silent'>, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function createConsoleLogger(level: LogLevel): Logger {
  if (level === 'silent') {
    return { debug: noop, info: noop, warn: noop, error: noop };
  }

  // Determine active threshold
  const threshold = levelOrder[(level as Exclude<LogLevel, 'silent'>)] ?? 30;

  return {
    debug: threshold <= levelOrder.debug ? console.debug.bind(console) : noop,
    info: threshold <= levelOrder.info ? console.info.bind(console) : noop,
    warn: threshold <= levelOrder.warn ? console.warn.bind(console) : noop,
    error: threshold <= levelOrder.error ? console.error.bind(console) : noop,
  };
}

// Singleton logger wired to config
let cachedLogger: Logger | null = null;

export function getLogger(): Logger {
  if (cachedLogger) return cachedLogger;
  try {
    // Lazy import to avoid circular deps
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { config } = require('@/config');
    const level = (config?.logLevel as LogLevel) || 'warn';
    cachedLogger = createConsoleLogger(level);
  } catch {
    cachedLogger = createConsoleLogger('warn');
  }
  return cachedLogger;
}
