import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import type { LogLevel, DiscoveryLogEntry } from '@nexusgraph/shared';

export type { LogLevel };

export interface LogEntry extends DiscoveryLogEntry {
  requestId?: string;
}

const MAX_BUFFER_SIZE = 1000;
const logBuffer: DiscoveryLogEntry[] = [];
const logEmitter = new EventEmitter();
logEmitter.setMaxListeners(200);

function formatLog(entry: LogEntry): string {
  return JSON.stringify(entry);
}

function log(
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>,
  tag?: string,
) {
  const timestamp = new Date().toISOString();
  const id = `log-${Date.now()}-${randomUUID().slice(0, 8)}`;
  
  const entry: DiscoveryLogEntry = {
    id,
    timestamp,
    level,
    tag: tag || (meta?.tag as string) || undefined,
    message,
    transformId: (meta?.transformId as string) || undefined,
    transformName: (meta?.transformName as string) || undefined,
    entityCount: (meta?.entityCount as number) || undefined,
    relationshipCount: (meta?.relationshipCount as number) || undefined,
    data: meta,
  };

  // Add to circular buffer
  logBuffer.push(entry);
  if (logBuffer.length > MAX_BUFFER_SIZE) {
    logBuffer.shift();
  }

  // Broadcast to live SSE subscribers
  try {
    logEmitter.emit('log', entry);
  } catch {
    // Ignore emit error
  }

  // Console output
  const line = formatLog(entry as LogEntry);
  switch (level) {
    case 'error':
      console.error(line);
      break;
    case 'warn':
      console.warn(line);
      break;
    default:
      console.log(line);
  }

  return entry;
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => log('debug', msg, meta, 'DEBUG'),
  info: (msg: string, meta?: Record<string, unknown>) => log('info', msg, meta, 'INFO'),
  warn: (msg: string, meta?: Record<string, unknown>) => log('warn', msg, meta, 'WARN'),
  error: (msg: string, meta?: Record<string, unknown>) => log('error', msg, meta, 'ERROR'),
  http: (method: string, path: string, status: number, durationMs: number, meta?: Record<string, unknown>) => {
    const level: LogLevel = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'http';
    return log(
      level,
      `${method} ${path} ${status} (${durationMs}ms)`,
      { method, path, status, durationMs, ...meta },
      'HTTP',
    );
  },
  collector: (collectorName: string, msg: string, meta?: Record<string, unknown>) =>
    log('collector', `[Collector: ${collectorName}] ${msg}`, { collector: collectorName, ...meta }, 'COLLECTOR'),
  transform: (transformName: string, msg: string, meta?: Record<string, unknown>) =>
    log('transform', `[Transform: ${transformName}] ${msg}`, { transform: transformName, ...meta }, 'TRANSFORM'),
  system: (msg: string, meta?: Record<string, unknown>) => log('system', msg, meta, 'SYSTEM'),
  scan: (msg: string, meta?: Record<string, unknown>) => log('scan', msg, meta, 'SCAN'),
  found: (msg: string, meta?: Record<string, unknown>) => log('found', msg, meta, 'FOUND'),
  success: (msg: string, meta?: Record<string, unknown>) => log('success', msg, meta, 'SUCCESS'),
  raw: (rawMessage: string, level: LogLevel = 'info', tag: string = 'DEV') =>
    log(level, rawMessage, undefined, tag),

  // Buffer & Subscription
  getBuffer: () => [...logBuffer],
  clearBuffer: () => {
    logBuffer.length = 0;
  },
  onLog: (listener: (entry: DiscoveryLogEntry) => void) => {
    logEmitter.on('log', listener);
  },
  offLog: (listener: (entry: DiscoveryLogEntry) => void) => {
    logEmitter.off('log', listener);
  },
};

export function generateRequestId(): string {
  return randomUUID();
}
