/**
 * Logging utility using Winston.
 */

import winston from 'winston';

export function createLogger(level: string = 'info'): winston.Logger {
  return winston.createLogger({
    level,
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      winston.format.errors({ stack: true }),
      winston.format.printf(({ timestamp, level, message, stack }) => {
        const baseLog = `${timestamp} [${level.toUpperCase()}]: ${message}`;
        return stack ? `${baseLog}\n${stack}` : baseLog;
      })
    ),
    transports: [
      new winston.transports.Console(),
      new winston.transports.File({ filename: 'bot-error.log', level: 'error' }),
      new winston.transports.File({ filename: 'bot-combined.log' })
    ]
  });
}

export type Logger = winston.Logger;

