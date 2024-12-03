"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const winston = __importStar(require("winston"));
const dotenv_1 = require("dotenv");
(0, dotenv_1.configDotenv)();
const logFormat = winston.format.printf(info => `${info.timestamp} ${info.level} [${info.metadata.module ?? ""}:${info.metadata.method ?? ""}]: ${info.message} ${info.level.includes("error") || info.level.includes("warn") ? JSON.stringify(info.metadata, (_, value) => {
    if (value instanceof Error) {
        return {
            ...value,
            name: value.name,
            message: value.message,
            stack: value.stack,
            cause: value.cause,
        };
    }
    else {
        return value;
    }
}) : ""}`);
exports.logger = winston.createLogger({
    level: process.env.LOGGING_LEVEL?.toLowerCase() ?? "debug",
    format: winston.format.json({
        replacer(key, value) {
            if (value instanceof Error) {
                return {
                    ...value,
                    name: value.name,
                    message: value.message,
                    stack: value.stack,
                    cause: value.cause,
                };
            }
            else {
                return value;
            }
        }
    }),
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }), winston.format.metadata({ fillExcept: ["message", "level", "timestamp"] }), ...(((process.env.ENV === "production" && process.env.SENTRY_ENVIRONMENT === "dev") || (process.env.ENV !== "production")) ? [winston.format.colorize(), logFormat] : [])),
        }),
    ],
});
//# sourceMappingURL=logger.js.map