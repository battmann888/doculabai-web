type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  data?: unknown;
}

class Logger {
  private logs: LogEntry[] = [];
  private maxLogs = 100;
  private isDevelopment = import.meta.env.DEV;

  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  private shouldLog(level: LogLevel): boolean {
    if (this.isDevelopment) return true;
    return level === 'error' || level === 'warn';
  }

  private addLog(level: LogLevel, category: string, message: string, data?: unknown): void {
    const entry: LogEntry = {
      timestamp: this.formatTimestamp(),
      level,
      category,
      message,
      data,
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    if (this.shouldLog(level)) {
      const prefix = `[${entry.timestamp}] [${level.toUpperCase()}] [${category}]`;
      if (data) {
        console.log(prefix, message, data);
      } else {
        console.log(prefix, message);
      }
    }
  }

  debug(category: string, message: string, data?: unknown): void {
    this.addLog('debug', category, message, data);
  }

  info(category: string, message: string, data?: unknown): void {
    this.addLog('info', category, message, data);
  }

  warn(category: string, message: string, data?: unknown): void {
    this.addLog('warn', category, message, data);
  }

  error(category: string, message: string, data?: unknown): void {
    this.addLog('error', category, message, data);
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  clearLogs(): void {
    this.logs = [];
  }

  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }
}

export const logger = new Logger();
