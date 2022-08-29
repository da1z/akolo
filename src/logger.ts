import { createLogger, format, transports } from "winston";
import { inspect } from "util";

const myFormat = format.printf(
    ({ level, message, label, timestamp, ...rest }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const args = (rest as any)[Symbol.for("splat")];
        const strArgs = (args || [])
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((arg: any) => {
                return inspect(arg, {
                    colors: true,
                });
            })
            .join(" ");
        return `${timestamp} [${label}] ${level}: ${message} ${strArgs}`;
    }
);
export const logger = createLogger({
    level: "info",
    transports: [
        new transports.Console({
            format: format.combine(
                format((info) => {
                    info.level = info.level.toUpperCase();
                    return info;
                })(),
                format.timestamp({
                    format: "YYYY-MM-DD HH:mm:ss",
                }),
                format.errors({ stack: true }),
                format.label({
                    label: "Akolo",
                }),
                format.splat(),
                format.colorize(),
                myFormat
            ),
        }),
    ],
});
