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
// Import with `import * as Sentry from "@sentry/node"` if you are using ESM
const Sentry = __importStar(require("@sentry/node"));
const profiling_node_1 = require("@sentry/profiling-node");
const logger_1 = require("../lib/logger");
if (process.env.SENTRY_DSN) {
    logger_1.logger.info("Setting up Sentry...");
    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        integrations: [
            (0, profiling_node_1.nodeProfilingIntegration)(),
        ],
        tracesSampleRate: process.env.SENTRY_ENVIRONMENT === "dev" ? 1.0 : 0.045,
        profilesSampleRate: 1.0,
        serverName: process.env.FLY_MACHINE_ID,
        environment: process.env.SENTRY_ENVIRONMENT ?? "production",
    });
}
//# sourceMappingURL=sentry.js.map