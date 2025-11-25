import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  transports: [new winston.transports.Console()],
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.colorize(),
    winston.format.printf(
      ({ level, message, timestamp }) => `[${timestamp}] ${level}: ${message as string}`
    )
  ),
});
