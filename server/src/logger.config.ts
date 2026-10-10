import * as winston from 'winston';
import 'winston-daily-rotate-file';
import { utilities as nestWinstonUtilities } from 'nest-winston';

const { combine, timestamp, ms, printf } = winston.format;

// Context for AI logs: new Logger(AI_LOG_CONTEXT). Everything logged with it
// goes to logs/ai/, including .debug(); the terminal shows .log() and up.
// Name timings durationMs, not ms: the terminal's "+12ms" overwrites ms.
export const AI_LOG_CONTEXT = 'AI';

// Keeps only entries logged with the AI context.
const onlyAI = winston.format((info) => (info.context === AI_LOG_CONTEXT ? info : false));

// Laravel-style lines for the log files: a header, then one indented
// "key: value" line per field, in the order they were logged. Short objects stay
// on one line as JSON; longer ones (e.g. a model's output) are pretty-printed.
// Any stack trace goes last, then a blank line between entries.
const indent = (text: string, spaces: string) => text.replace(/\n/g, `\n${spaces}`);

function formatValue(value: unknown): string
{
  if (typeof value !== 'object' || value === null) return String(value);
  const oneLine = JSON.stringify(value);
  return oneLine.length <= 100 ? oneLine : JSON.stringify(value, null, 2);
}

const readable = printf(({ timestamp, level, message, context, stack, ...fields }) => {
  const lines = [`[${timestamp}] ${context ?? 'App'}.${level.toUpperCase()}: ${message}`];
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) lines.push(`  ${key}: ${indent(formatValue(value), '  ')}`);
  }
  // nest-winston passes the stack as an array, which may hold undefined.
  for (const trace of [stack].flat()) {
    if (typeof trace === 'string' && trace) lines.push(`  ${indent(trace, '  ')}`);
  }
  return `${lines.join('\n')}\n`;
});
const fileTimestamp = () => timestamp({ format: 'YYYY-MM-DD HH:mm:ss' });

// Plugged in behind Nest's Logger in main.ts, so every this.logger call goes
// through it. The terminal level comes from LOG_LEVEL (default info). Files are
// daily (logs/<name>/<name>-YYYY-MM-DD.log) and deleted after 14 days.
export const loggerConfig: winston.LoggerOptions = {
  level: 'debug', // each transport sets its own level below
  transports: [
    new winston.transports.Console({
      level: process.env.LOG_LEVEL ?? 'info',
      format: combine(
        timestamp(),
        ms(),
        nestWinstonUtilities.format.nestLike('Capstone', { colors: true, prettyPrint: true }),
      ),
    }),
    new winston.transports.DailyRotateFile({
      dirname: 'logs/error',
      filename: 'error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxFiles: '14d',
      format: combine(fileTimestamp(), readable),
    }),
    new winston.transports.DailyRotateFile({
      dirname: 'logs/ai',
      filename: 'ai-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'debug',
      maxFiles: '14d',
      format: combine(onlyAI(), fileTimestamp(), readable),
    }),
  ],
};
