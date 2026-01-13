type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
    txId?: string;
    walletId?: string;
    policyId?: string;
    [key: string]: unknown;
}

function formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const ctx = context ? ` ${JSON.stringify(context)}` : '';
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${ctx}`;
}

export const logger = {
    debug(message: string, context?: LogContext) {
        if (process.env.NODE_ENV === 'development') {
            console.log(formatMessage('debug', message, context));
        }
    },

    info(message: string, context?: LogContext) {
        console.log(formatMessage('info', message, context));
    },

    warn(message: string, context?: LogContext) {
        console.warn(formatMessage('warn', message, context));
    },

    error(message: string, context?: LogContext) {
        console.error(formatMessage('error', message, context));
    },
};
